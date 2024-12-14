import { NODE_ENV, DISKS } from '../config/config.js';
import os from 'os';
import fs from 'fs-extra';
import machine from 'node-machine-id';
import checkDiskSpace from 'check-disk-space';
import logger from './logger.js';

class Server {
  id = null;
  name = os.hostname();
  arch = os.arch();
  cpu = os.cpus()[0].model.trim();
  cores = os.cpus().length;
  memory = os.totalmem();
  type = os.type();
  transfers = [];

  async init() {
    try {
      this.id = await machine.machineId({ original: true });

      for (const disk of DISKS) {
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

      this.disks = await Promise.all(
        DISKS.map(async (disk) => {
          const { size, free } = await checkDiskSpace(disk.path);
          return {
            diskId: disk.id,
            path: disk.path,
            size,
            free: Math.floor(free * 0.9),
          };
        })
      );

      return logger.info(
        `Server initialized - Running Node.js ${process.version} on ${NODE_ENV} environment.`
      );
    } catch (err) {
      throw err;
    }
  }
}

export default new Server();
