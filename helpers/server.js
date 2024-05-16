import { DISKS } from '../config/config.js';
import os from 'os';
import machine from 'node-machine-id';
import checkDiskSpace from 'check-disk-space';

const id = await machine.machineId({ original: true });

class Server {
  constructor() {
    this.id = id;
    this.name = os.hostname();
    this.arch = os.arch();
    this.cpu = os.cpus()[0].model.trim();
    this.cores = os.cpus().length;
    this.memory = os.totalmem();
    this.type = os.type();
  }

  async getInfo() {
    return {
      ...this,
      disks: await Promise.all(
        DISKS.map(async (disk) => {
          const { size, free } = await checkDiskSpace(disk.path);
          return {
            diskId: disk.id,
            path: disk.path,
            size,
            free: Math.floor(free * 0.9),
          };
        })
      ),
    };
  }
}

export default new Server();
