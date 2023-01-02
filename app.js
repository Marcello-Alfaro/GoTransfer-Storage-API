import express from 'express';
import { API_URL, JWT_SECRET, PORT, SOCKET_NAMESPACE } from './config/config.js';
import io from 'socket.io-client';
import https from 'https';
import http from 'http';
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
    const { request, dirId, filename } = data;
    try {
      await fsp.access(`storage/${dirId}`);
    } catch (err) {
      await fsp.mkdir(`storage/${dirId}`, { recursive: true });
    }
    http.get(
      `${API_URL}/files/transfer/storage-server?Authorization=Bearer ${token}&request=${request}`,
      async (res) => {
        if (res.statusCode !== 200)
          return await fsp.rm(`storage/${dirId}`, { recursive: true, force: true });

        res.pipe(fs.createWriteStream(`storage/${dirId}/${filename}`));
      }
    );
  } catch (err) {
    console.error(err);
  }
});

socket.on('get-file', async (data) => {
  try {
    const { request, dirId, name } = data;

    const body = fs.createReadStream(`storage/${dirId}/${name}`);

    await fetch(`${API_URL}/files/get-file?isAuth=false`, {
      method: 'POST',
      body,
      headers: {
        request,
      },
    });
  } catch (err) {
    console.error(err);
  }
});

socket.on('get-all-files', async (data) => {
  try {
    const { request, dirId, title, Files } = data;

    const zip = new JSZip();
    const folder = zip.folder(title);

    Files.forEach((entry) =>
      folder.file(entry.name, fs.createReadStream(`storage/${dirId}/${entry.name}`))
    );
    const body = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true });

    await fetch(`${API_URL}/files/get-all-files?isAuth=false`, {
      method: 'POST',
      body,
      headers: {
        request,
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
