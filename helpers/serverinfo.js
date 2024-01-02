import { DISKS } from '../config/config.js';
import os from 'os';
import machine from 'node-machine-id';
import checkDiskSpace from 'check-disk-space';

export default async () => {
  return {
    serverId: await machine.machineId({ original: true }),
    name: os.hostname(),
    arch: os.arch(),
    cpu: os.cpus()[0].model.trim(),
    cores: os.cpus().length,
    memory: os.totalmem(),
    type: os.type(),
    disks: await Promise.all(
      DISKS.disks.map(async (entry) => {
        const { diskPath, size, free } = await checkDiskSpace(entry.label);
        return {
          diskId: entry.id,
          path: entry.path ?? diskPath,
          size,
          free: Math.floor(free * 0.9),
        };
      })
    ),
  };
};
