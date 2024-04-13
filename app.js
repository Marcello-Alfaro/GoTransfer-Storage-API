import { API_URL, API_PATH, JWT_SECRET, SOCKET_NAMESPACE } from './config/config.js';
import server from './helpers/server.js';
import logger from './helpers/logger.js';
import io from 'socket.io-client';
import fs from 'fs-extra';
import { pipeline } from 'stream/promises';
import archiver from 'archiver';
import jwt from 'jsonwebtoken';

try {
  logger.info(`Server started - Running Node.js version: ${process.version}`);

  const token = jwt.sign('SYN', JWT_SECRET);

  const socket = io(API_URL + SOCKET_NAMESPACE, {
    path: `${API_PATH}.io/`,
    auth: {
      token,
    },
  });

  socket.on('connect', async () => {
    try {
      server.setSocket(socket.id);
      await socket.emitWithAck('remove-unfinished', server.serverId);
      socket.emit('server-info', await server.getInfo());
      logger.info('Connection with main server established!');
    } catch (err) {
      throw err;
    }
  });

  socket.on('disconnect', (reason) =>
    logger.warn(`Connection with main server lost due to ${reason}`)
  );

  socket.on('allocate-transfer', async ({ diskPath, transferId }, res) => {
    try {
      await fs.mkdirp(`${diskPath}/storage/${transferId}`);
      res({ ok: true });
    } catch (err) {
      res({ ok: false, err });
      logger.error(err);
    }
  });

  socket.on('handle-file', async ({ transferId, fileId, diskPath }) => {
    try {
      const res = await fetch(`${API_URL + API_PATH}/redirect/storage-server`, {
        headers: {
          fileId,
          transferId,
          authorization: `Bearer ${token}`,
        },
      });

      await pipeline(res.body, fs.createWriteStream(`${diskPath}/storage/${transferId}/${fileId}`));

      socket.emit(fileId, 'ok');
    } catch (err) {
      await fs.remove(`${diskPath}/storage/${transferId}`);
      logger.error(err);
    }
  });

  socket.on('fetch-transfer', async (data) => {
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
              fs.createReadStream(`${transfer.Disk.path}/storage/${transfer.transferId}/${fileId}`),
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
        headers: {
          downloadId,
          authorization: `Bearer ${token}`,
        },
      });
    } catch (err) {
      logger.error(err);
    }
  });

  socket.on('remove-transfer', async ({ diskPath, transferId }, res) => {
    try {
      await fs.rm(`${diskPath}/storage/${transferId}`, { recursive: true, force: true });
      res && res({ ok: true });
    } catch (err) {
      logger.error(err);
      res && res({ ok: false, err });
    }
  });

  socket.on('connect_error', (err) => logger.error(`Connection error due to ${err.message}`));

  process.on('uncaughtException', (err) => {
    logger.fatal(err);

    setTimeout(() => process.abort(), 1000).unref();
    process.exit(1);
  });
} catch (err) {
  logger.error(err);
}
