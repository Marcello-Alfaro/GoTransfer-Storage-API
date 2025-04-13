import { NODE_ENV } from '../config/config.js';
import os from 'os';
import fs from 'fs-extra';
import machine from 'node-machine-id';

class Server {
  id = null;
  name = os.hostname();
  arch = os.arch();
  cpu = os.cpus()[0].model.trim();
  cores = os.cpus().length;
  memory = os.totalmem();
  type = os.type();
  disks = [];
  transfers = [];

  async init() {
    try {
      this.id = await machine.machineId({ original: true });

      const disks = JSON.parse(process.env.DISKS);

      if (disks.length === 0)
        throw new Error('Initialization failed. No disks provided or detected.');

      for (const disk of disks) {
        const path = `${disk.path}/storage`;
        if (!(await fs.pathExists(path))) {
          await fs.mkdirp(path);
          continue;
        }

        this.transfers.push(
          ...(await fs.readdir(path))
            .filter((entry) => entry.startsWith('.'))
            .map((entry) => `${path}/${entry}`)
        );
      }

      await Promise.all(
        this.transfers.map(
          async (entry) =>
            await fs.rm(entry, {
              recursive: true,
              force: true,
            })
        )
      );

      delete this.transfers;

      for (const disk of disks) {
        const { blocks, bavail, bsize } = fs.statfsSync(disk.path);
        this.disks.push({
          diskId: disk.id,
          path: disk.path,
          size: blocks * bsize,
          free: Math.floor(bavail * bsize * 0.9),
        });
      }

      console.log('------------------------------------------------------------------');
      console.log(`GoTransfer-Storage-API started on server ${os.hostname()}`);
      console.log(`Running Node.js ${process.version} on ${NODE_ENV} environment.`);
      console.log(`Platform: ${os.platform()} ${os.arch()}`);
      console.log(`Memory: ${os.totalmem()}`);
      console.log(`CPU: ${os.cpus()[0].model.trim()}`);
      console.log(`Disks: ${disks.length}`);
      console.log('------------------------------------------------------------------');
    } catch (err) {
      throw err;
    }
  }
}

export default new Server();
