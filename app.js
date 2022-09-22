import express from 'express';
import { API_URL, JWT_SECRET, PORT, SOCKET_NAMESPACE } from './config/config.js';
import io from 'socket.io-client';
import https from 'https';
import http from 'http';
import fs from 'fs';
import fsp from 'fs/promises';
import fetch from 'node-fetch';
import JSZip from 'jszip';
import rimraf from 'rimraf';
import jwt from 'jsonwebtoken';

const key = fs.readFileSync('server.key');
const cert = fs.readFileSync('server.cert');

const app = express();

if (!fs.existsSync('storage')) fs.mkdirSync('storage');

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

socket.on('send-files', (data) => {
  const { dirId, files } = data;
  if (!fs.existsSync(`storage/${dirId}`)) fs.mkdirSync(`storage/${dirId}`);

  files.forEach((entry, index, arr) => {
    const file = fs.createWriteStream(`storage/${dirId}/${entry.name}`);
    http.get(`${API_URL}/files/transfer/${dirId}/${entry.fileId}?isAuth=false`, (res) => {
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        if (index === arr.length - 1) return socket.emit(`transfer-${dirId}-completed`);
      });
    });
  });
});

socket.on('get-file', async (data) => {
  const { dirId, fileId, name } = data;

  const filepath = `storage/${dirId}/${name}`;
  const file = fs.createReadStream(filepath);
  const response = await fetch(`${API_URL}/files/get-file?isAuth=false&fileId=${fileId}`, {
    method: 'POST',
    body: file,
  });

  const { success } = await response.json();
  if (success) return await fsp.unlink(filepath);
});

socket.on('get-all-files', async (data) => {
  try {
    const { dirId, title, Files } = data;
    const zip = new JSZip();
    const folder = zip.folder(title);
    Files.forEach((entry) =>
      folder.file(entry.name, fs.createReadStream(`storage/${dirId}/${entry.name}`))
    );
    const body = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true });

    const response = await fetch(`${API_URL}/files/get-all-files?isAuth=false&dirId=${dirId}`, {
      method: 'POST',
      body,
    });

    const { success } = await response.json();
    if (success) return rimraf(`storage/${dirId}`, (err) => err);
  } catch (err) {
    console.log(err);
  }
});

socket.on('connect_error', (err) => {
  console.log(`connect_error due to ${err.message}`);
});

process.on('uncaughtException', (err) => {
  console.error(err);
});
