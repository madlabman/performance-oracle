import chalk from 'chalk';
import * as R from 'ramda';

import { isDebug } from './config.js';

export function toHex(t: Uint8Array): string {
    return '0x' + Buffer.from(t).toString('hex');
}

export const fitsInUintN = R.curry(
    (bits: number, n: bigint) => n < 2n ** BigInt(bits),
);

export const isUint64 = fitsInUintN(64);

export function debug(msg: string, ...args: any[]) {
    if (isDebug()) console.log(chalk.blue('DEBUG', '::', msg), ...args);
}
