import { API_URL, API_PATH, JWT_SECRET, SOCKET_NAMESPACE } from './config/config.js';
import io from 'socket.io-client';
import fs from 'fs-extra';
import { pipeline } from 'stream/promises';
import fetch from 'node-fetch';
import JSZip from 'jszip';
import jwt from 'jsonwebtoken';
import serverinfo from './helpers/serverinfo.js';

try {
  console.log('Storage server started!');

  const token = jwt.sign('SYN', JWT_SECRET);

  const socket = io(API_URL + SOCKET_NAMESPACE, {
    path: `${API_PATH}.io/`,
    auth: {
      token,
    },
  });

  socket.on('connect', async () => {
    try {
      socket.emit('server-info', await serverinfo());
      console.log('Connection with main server established!');
    } catch (err) {
      throw err;
    }
  });

  socket.on('disconnect', () => console.log('Connection with main server lost'));

  socket.on('allocate-transfer', async ({ diskPath, transferId }, res) => {
    try {
      await fs.mkdirp(`${diskPath}/storage/${transferId}`);
      res({ ok: true });
    } catch (err) {
      res({ ok: false });
    }
  });

  socket.on('handle-file', async ({ diskPath, transferId, fileId }) => {
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
      console.error(err);
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

        if (type === '08ad027d') {
          const zip = new JSZip();
          const root = zip.folder(transfer.Folders[0].name);

          transfer.Folders[0].Files.forEach(({ fileId, name, path }) => {
            root
              .folder(path)
              .file(
                name,
                fs.createReadStream(
                  `${transfer.Disk.path}/storage/${transfer.transferId}/${fileId}`
                )
              );
          });

          return zip.generateNodeStream({ streamFiles: true });
        }

        const zip = new JSZip();
        const root = zip.folder(transfer.title);

        transfer.Files.forEach((file) =>
          root.file(
            file.name,
            fs.createReadStream(
              `${transfer.Disk.path}/storage/${transfer.transferId}/${file.fileId}`
            )
          )
        );

        transfer.Folders.forEach((folder) => {
          folder.Files.forEach((folderFile) =>
            root
              .folder(folderFile.path)
              .file(
                folderFile.name,
                fs.createReadStream(
                  `${transfer.Disk.path}/storage/${transfer.transferId}/${folderFile.fileId}`
                )
              )
          );
        });

        return zip.generateNodeStream({ streamFiles: true });
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
      console.error(err);
    }
  });

  socket.on(
    'remove-transfer',
    async ({ diskPath, transferId }) => await fs.remove(`${diskPath}/storage/${transferId}`)
  );

  socket.on('connect_error', (err) => {
    console.error(`connect_error due to ${err.message}`);
  });
} catch (err) {
  console.error(err);
}

process.on('uncaughtException', (err) => {
  console.error(err);
});
