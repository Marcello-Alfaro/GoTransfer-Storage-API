import { API_URL, API_PATH, JWT_SECRET, SOCKET_NAMESPACE } from './config/config.js';
import server from './helpers/server.js';
import logger from './helpers/logger.js';
import fs from 'fs-extra';
import EventEmitter from 'events';
import { pipeline } from 'stream/promises';
import archiver from 'archiver';
import jwt from 'jsonwebtoken';
import ErrorObject from './helpers/errorObject.js';

try {
  await server.init();

  const token = jwt.sign({ id: server.id, name: server.name }, JWT_SECRET);

  const eventEmitter = new EventEmitter();

  const socket = new WebSocket(`${API_URL + API_PATH}.uws${SOCKET_NAMESPACE}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  socket.ack = (messageId) =>
    new Promise((res) => eventEmitter.on(messageId, (response) => res(response)));

  socket.sendResponse = (messageId, response = { ok: true }) =>
    socket.send(
      JSON.stringify({
        action: 'server-response',
        messageId,
        response,
      })
    );

  socket.onopen = async function () {
    try {
      const { ok } = await this.ack(server.id);

      if (!ok)
        throw new ErrorObject(
          'Something went wrong while establishing the connection with the server.'
        );

      logger.info('Connection with main server established!');
    } catch (err) {
      throw err;
    }
  };

  socket.onmessage = async function ({ data: message }) {
    const data = JSON.parse(message);
    const { action, messageId } = data;

    if (action === 'fetch-server-info') {
      try {
        this.sendResponse(messageId, server);
      } catch (err) {
        logger.error(err);
      }
    }

    if (action === 'allocate-transfer') {
      try {
        const { diskPath, transferId } = data;
        await fs.mkdir(`${diskPath}/storage/.${transferId}`);

        this.sendResponse(messageId);
      } catch (err) {
        this.sendResponse(messageId, { ok: false });
        logger.error(err);
      }
    }

    if (action === 'transfer-complete') {
      try {
        const { transferId, diskPath } = data;
        await fs.rename(`${diskPath}/storage/.${transferId}`, `${diskPath}/storage/${transferId}`);

        this.sendResponse(messageId);
      } catch (err) {
        this.sendResponse(messageId, { ok: false });
        logger.error(err);
      }
    }

    if (action === 'handle-file') {
      try {
        const { transferId, fileId, diskPath } = data;

        const { body } = await fetch(`${API_URL + API_PATH}/redirect/storage-server`, {
          headers: {
            fileId,
            transferId,
            authorization: `Bearer ${token}`,
          },
        });

        await pipeline(body, fs.createWriteStream(`${diskPath}/storage/.${transferId}/${fileId}`));

        this.sendResponse(messageId);
      } catch (err) {
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

            return zip;
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

          return zip;
        })();

        await fetch(`${API_URL + API_PATH}/redirect/main-server`, {
          method: 'PUT',
          body,
          duplex: 'half',
          priority: 'high',
          redirect: 'error',
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
        const { diskPath, transferId, aborted = false } = data;
        await fs.rm(`${diskPath}/storage/${aborted ? '.' : ''}${transferId}`, {
          recursive: true,
          force: true,
        });
      } catch (err) {
        logger.error(err);
      }
    }

    if (action === 'main-server-response') return eventEmitter.emit(messageId, data.response);
  };

  socket.onclose = ({ code }) => {
    logger.warn(`Connection with main server closed due to ${code}`);
    process.exit(1);
  };

  socket.onerror = ({ error: { message, code } }) => {
    logger.error(`Connection error due to ${message || ''}${code || ''}`);
    process.exit(1);
  };

  process
    .on('unhandledRejection', (reason) => logger.error(`Unhandled Promise Rejection ${reason}`))
    .on('uncaughtException', (err) => {
      logger.fatal(err);
      setTimeout(() => process.abort(), 1000).unref();
      process.exit(1);
    });
} catch (err) {
  logger.error(err);
}
