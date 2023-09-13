import chalk from 'chalk';

import { isDebug } from './config.js';

export function toHex(t: Uint8Array): string {
    return '0x' + Buffer.from(t).toString('hex');
}

export function debug(msg: string, ...args: any[]) {
    if (isDebug()) console.log(chalk.blue('DEBUG', '::', msg), ...args);
}
