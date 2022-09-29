import express from 'express';
import { API_URL, JWT_SECRET, PORT, SOCKET_NAMESPACE } from './config/config.js';
import io from 'socket.io-client';
import https from 'https';
import fs from 'fs';
import fsp from 'fs/promises';
import fetch from 'node-fetch';
import JSZip from 'jszip';
import jwt from 'jsonwebtoken';

const key = fs.readFileSync('server.key');
const cert = fs.readFileSync('server.cert');

const app = express();

const socket = io(`${API_URL}${SOCKET_NAMESPACE}`, {
  auth: {
    token: jwt.sign({ message: 'Authenticate' }, JWT_SECRET),
  },
});

https
  .createServer({ key, cert }, app)
  .listen(PORT, () => console.log(`Server started on port: ${PORT}`));

socket.on('connect', () => {
  console.log('Connection to main server established!');
});

socket.on('send-files', async (data) => {
  try {
    const { dirId, files } = data;
    try {
      await fsp.access(`storage/${dirId}`);
    } catch (err) {
      await fsp.mkdir(`storage/${dirId}`, { recursive: true });
    }

    files.forEach((entry, index, arr) => {
      const file = fs.createWriteStream(`storage/${dirId}/${entry.name}`);
      https.get(`${API_URL}/files/transfer/${dirId}/${entry.fileId}?isAuth=false`, (res) => {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          if (index === arr.length - 1) return socket.emit(`transfer-${dirId}-completed`);
        });
      });
    });
  } catch (err) {
    console.error(err);
  }
});

socket.on('get-file', async (data) => {
  try {
    const { dirId, name } = data;

    const filepath = `storage/${dirId}/${name}`;
    const body = fs.createReadStream(filepath);

    const response = await fetch(`${API_URL}/files/get-file?isAuth=false`, {
      method: 'POST',
      body,
    });

    const { success } = await response.json();
    if (success) return await fsp.unlink(filepath);
  } catch (err) {
    console.error(err);
  }
});

socket.on(
  `dir-files-downloaded`,
  async ({ dirId }) => await fsp.rm(`storage/${dirId}`, { recursive: true, force: true })
);

socket.on('get-all-files', async (data) => {
  try {
    const { dirId, title, Files } = data;
    const zip = new JSZip();
    const folder = zip.folder(title);
    Files.forEach((entry) =>
      folder.file(entry.name, fs.createReadStream(`storage/${dirId}/${entry.name}`))
    );
    const body = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true });

    const response = await fetch(`${API_URL}/files/get-all-files?isAuth=false`, {
      method: 'POST',
      body,
    });

    const { success } = await response.json();

    if (success) return await fsp.rm(`storage/${dirId}`, { recursive: true, force: true });
  } catch (err) {
    console.error(err);
  }
});

socket.on(
  'file-expired',
  async ({ dirId }) => await fsp.rm(`storage/${dirId}`, { recursive: true, force: true })
);

socket.on('connect_error', (err) => {
  console.error(`connect_error due to ${err.message}`);
});

process.on('uncaughtException', (err) => {
  console.error(err);
});
