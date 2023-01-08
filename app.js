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
const token = jwt.sign({ message: 'Authenticate' }, JWT_SECRET);

const socket = io(`${API_URL}${SOCKET_NAMESPACE}`, {
  auth: {
    token,
  },
});

https
  .createServer({ key, cert }, app)
  .listen(PORT, () => console.log(`Server started on port: ${PORT}`));

socket.on('connect', () => {
  console.log('Connection to main server established!');
});

socket.on('alloc-storage-server', async (data) => {
  try {
    const { dirId, filename, chunk } = data;

    try {
      await fsp.access(`storage/${dirId}`);
    } catch (err) {
      await fsp.mkdir(`storage/${dirId}`, { recursive: true });
    }

    const buffer = new Buffer.from(chunk);

    fs.appendFile(`storage/${dirId}/${filename}`, buffer, (err) => {
      if (err) throw err;
    });
  } catch (err) {
    console.error(err);
  }
});

socket.on('get-file', async (data) => {
  try {
    const { requestId, dirId, fileId } = data;

    const body = fs.createReadStream(`storage/${dirId}/${fileId}`);

    await fetch(`${API_URL}/files/get-file?isAuth=false`, {
      method: 'POST',
      body,
      headers: {
        requestId,
      },
    });
  } catch (err) {
    console.error(err);
  }
});

socket.on('get-all-files', async (data) => {
  try {
    const { requestId, dirId, title, Files } = data;

    const zip = new JSZip();
    const folder = zip.folder(title);

    Files.forEach((entry) =>
      folder.file(entry.name, fs.createReadStream(`storage/${dirId}/${entry.fileId}`))
    );
    const body = zip.generateNodeStream({ streamFiles: true });

    await fetch(`${API_URL}/files/get-all-files?isAuth=false`, {
      method: 'POST',
      body,
      headers: {
        requestId,
      },
    });
  } catch (err) {
    console.error(err);
  }
});

socket.on(
  'unlink-file',
  async ({ dirId }) => await fsp.rm(`storage/${dirId}`, { recursive: true, force: true })
);

socket.on('connect_error', (err) => {
  console.error(`connect_error due to ${err.message}`);
});

process.on('uncaughtException', (err) => {
  console.error(err);
});
