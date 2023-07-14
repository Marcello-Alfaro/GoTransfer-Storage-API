import { API_URL, JWT_SECRET, SOCKET_NAMESPACE } from './config/config.js';
import io from 'socket.io-client';
import fs from 'fs';
import fsp from 'fs/promises';
import { pipeline } from 'stream/promises';
import fetch from 'node-fetch';
import JSZip from 'jszip';
import jwt from 'jsonwebtoken';

console.log('Storage server started');

const token = jwt.sign('SYN', JWT_SECRET);

const socket = io(`${API_URL}${SOCKET_NAMESPACE}`, {
  auth: {
    token,
  },
});

socket.on('connect', () => console.log('Connection with main server established!'));

socket.on('alloc-storage-server', async ({ filePartId, transferId, filename }) => {
  try {
    const path = `storage/${transferId}`;

    try {
      await fsp.access(path);
    } catch (err) {
      await fsp.mkdir(path, { recursive: true });
    }

    const response = await fetch(`${API_URL}/files/transfer/storage-server`, {
      headers: {
        Authorization: `Bearer ${token}`,
        filePartId,
      },
    });

    await pipeline(response.body, fs.createWriteStream(`${path}/${filename}`, { flags: 'a' }));

    socket.emit(filePartId, `ACK ${filePartId}`);
  } catch (err) {
    console.error(err);
    await fsp.rm(`storage/${transferId}`, { recursive: true, force: true });
  }
});

socket.on('get-file', async (data) => {
  try {
    const { requestId, single, isfolder, folder, transferId, transfer, fileId } = data;

    if (isfolder) {
      const zip = new JSZip();
      const root = zip.folder(folder.name);

      folder.Files.forEach(({ fileId, name, path }) => {
        root.folder(path).file(name, fs.createReadStream(`storage/${transferId}/${fileId}`));
      });

      const body = zip.generateNodeStream({ streamFiles: true });

      return await fetch(`${API_URL}/files/get-file`, {
        method: 'PUT',
        body,
        headers: {
          requestId,
          Authorization: `Bearer ${token}`,
        },
      });
    }

    const body = single
      ? fs.createReadStream(`storage/${transferId}/${fileId}`)
      : (() => {
          const { Files = [], Folders = [] } = transfer;
          const files = [...Files, ...Folders];

          const zip = new JSZip();
          const root = zip.folder(transfer.title);

          files.forEach((file) => {
            if (file?.fileId)
              return root.file(
                file.name,
                fs.createReadStream(`storage/${transferId}/${file.fileId}`)
              );

            if (file?.folderId) {
              const rootfolder = root.folder(file.name);

              file.Files.forEach((folderFile) =>
                rootfolder
                  .folder(folderFile.path)
                  .file(
                    folderFile.name,
                    fs.createReadStream(`storage/${transferId}/${folderFile.fileId}`)
                  )
              );
            }
          });
          return zip.generateNodeStream({ streamFiles: true });
        })();

    await fetch(`${API_URL}/files/get-file`, {
      method: 'PUT',
      body,
      headers: {
        requestId,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    console.error(err);
  }
});

socket.on(
  'unlink-file',
  async ({ transferId }) => await fsp.rm(`storage/${transferId}`, { recursive: true, force: true })
);

socket.on('connect_error', (err) => {
  console.error(`connect_error due to ${err.message}`);
});

process.on('uncaughtException', (err) => {
  console.error(err);
});
