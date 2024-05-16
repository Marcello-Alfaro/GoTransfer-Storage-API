import { API_URL, API_PATH, JWT_SECRET, SOCKET_CHANNEL } from './config/config.js';
import server from './helpers/server.js';
import logger from './helpers/logger.js';
import WebSocket from 'ws';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';
import EventEmitter from 'events';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import archiver from 'archiver';
import jwt from 'jsonwebtoken';

try {
  logger.info(`Server started - Running Node.js version: ${process.version}`);

  const token = jwt.sign({ id: server.id, name: server.name }, JWT_SECRET);

  (function init() {
    const socket = new WebSocket(`${API_URL + API_PATH}.uws${SOCKET_CHANNEL}`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const eventEmitter = new EventEmitter();

    socket.sendWithAck = async (message) => {
      const messageId = randomUUID();
      socket.send(JSON.stringify({ messageId, ...message }));

      await new Promise((res) => eventEmitter.once(messageId, (response) => res(response)));
    };

    socket.ack = async (messageId) => {
      return await new Promise((res) => eventEmitter.on(messageId, (response) => res(response)));
    };

    socket.on('open', async () => {
      try {
        await socket.ack(server.id);

        await socket.sendWithAck({ action: 'fetch-server-info', server: await server.getInfo() });
        logger.info('Connection with main server established!');
      } catch (err) {
        throw err;
      }
    });

    socket.on('message', async (message) => {
      const data = JSON.parse(message);
      const { action, messageId } = data;

      if (action === 'allocate-transfer') {
        try {
          const { diskPath, transferId } = data;
          await fs.mkdirp(`${diskPath}/storage/${transferId}`);
          socket.send(
            JSON.stringify({
              action: 'server-response',
              messageId,
              response: { ok: true, status: 200 },
            })
          );
        } catch (err) {
          socket.send(
            JSON.stringify({
              action: 'server-response',
              messageId,
              response: { ok: false, status: 500 },
            })
          );
          logger.error(err);
        }
      }

      if (action === 'handle-file') {
        try {
          const { transferId, fileId, diskPath } = data;

          const res = await fetch(`${API_URL + API_PATH}/redirect/storage-server`, {
            headers: {
              fileId,
              transferId,
              authorization: `Bearer ${token}`,
            },
          });

          await pipeline(
            res.body,
            fs.createWriteStream(`${diskPath}/storage/${transferId}/${fileId}`)
          );

          socket.send(
            JSON.stringify({
              action: 'server-response',
              messageId,
              response: { ok: true, status: 200 },
            })
          );
        } catch (err) {
          await fs.remove(`${data.diskPath}/storage/${data.transferId}`);
          logger.error(err);
        }
      }

      if (action === 'fetch-transfer') {
        try {
          const { type, downloadId, transfer } = data;

          const body = (() => {
            if (type === 'b5ac9c2b')
              return fs.createReadStream(
                `${transfer.Disk.path}/storage/${transfer.transferId}/${transfer.Files[0].fileId}`
              );

            const zip = archiver('zip', { zlib: { level: 0 } });

            if (type === '08ad027d') {
              transfer.Folders[0].Files.forEach(({ fileId, path }) => {
                zip.append(
                  fs.createReadStream(
                    `${transfer.Disk.path}/storage/${transfer.transferId}/${fileId}`
                  ),
                  { name: path }
                );
              });

              zip.finalize();

              return Readable.wrap(zip);
            }

            transfer.Files.forEach((file) =>
              zip.append(
                fs.createReadStream(
                  `${transfer.Disk.path}/storage/${transfer.transferId}/${file.fileId}`
                ),
                { name: `${transfer.title}/${file.name}` }
              )
            );

            transfer.Folders.forEach((folder) => {
              folder.Files.forEach((folderFile) =>
                zip.append(
                  fs.createReadStream(
                    `${transfer.Disk.path}/storage/${transfer.transferId}/${folderFile.fileId}`
                  ),
                  { name: `${transfer.title}/${folderFile.path}` }
                )
              );
            });

            zip.finalize();

            return Readable.wrap(zip);
          })();

          await fetch(`${API_URL + API_PATH}/redirect/main-server`, {
            method: 'PUT',
            body,
            headers: {
              downloadId,
              authorization: `Bearer ${token}`,
            },
          });
        } catch (err) {
          logger.error(err);
        }
      }

      if (action === 'remove-transfer') {
        try {
          const { diskPath, transferId } = data;
          await fs.rm(`${diskPath}/storage/${transferId}`, { recursive: true, force: true });

          socket.send(
            JSON.stringify({
              action: 'server-response',
              messageId,
              response: { ok: true, status: 200 },
            })
          );
        } catch (err) {
          logger.error(err);
          socket.send(
            JSON.stringify({
              action: 'server-response',
              messageId,
              response: { ok: false, status: 500 },
            })
          );
        }
      }

      if (action === 'main-server-response') {
        const { messageId, response } = data;
        eventEmitter.emit(messageId, response);
      }
    });

    socket.on('close', (code, reason) => {
      logger.warn(`Connection with main server lost due to ${code}:${reason}`);
      setTimeout(init, 2000);
    });

    socket.on('error', (err) => {
      logger.error(`Connection error due to ${err}`);
    });
  })();

  process.on('uncaughtException', (err) => {
    logger.fatal(err);

    setTimeout(() => process.abort(), 1000).unref();
    process.exit(1);
  });
} catch (err) {
  logger.error(err);
}
