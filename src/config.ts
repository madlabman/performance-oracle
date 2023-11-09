import * as R from 'ramda';
import { config as dotenv } from 'dotenv';

import { Config } from './types.js';

export function getConfig(): Config {
    return getConfigFromEnv();
}

export function isDebug(): boolean {
    return !R.either(R.isNil, isEmptyString)(process.env.DEBUG);
}

function getConfigFromEnv(): Config {
    dotenv();

    R.forEach(assertEnvIsSet, [
        'EL_URI',
        'CL_URI',
        'CSM_ADDRESS',
        'STETH_ADDRESS',
        'ORACLE_ADDRESS',
        'CONSENSUS_ADDRESS',
        'PINATA_API_KEY',
        'PINATA_SECRET_API_KEY',
        'SIGNER_KEY',
    ]);

    return {
        EL_URI: process.env.EL_URI,
        CL_URI: process.env.CL_URI,
        CL_TIMEOUT: R.defaultTo(30_000, Number(process.env.CL_TIMEOUT)),
        CSM_ADDRESS: process.env.CSM_ADDRESS,
        STETH_ADDRESS: process.env.STETH_ADDRESS,
        ORACLE_ADDRESS: process.env.ORACLE_ADDRESS,
        CONSENSUS_ADDRESS: process.env.CONSENSUS_ADDRESS,
        PINATA_API_KEY: process.env.PINATA_API_KEY,
        PINATA_SECRET_API_KEY: process.env.PINATA_SECRET_API_KEY,
        SIGNER_KEY: process.env.SIGNER_KEY,
        ARTIFACTS_DIR: R.defaultTo('artifacts', process.env.ARTIFACTS_DIR),
        MAX_CONCURRENCY: R.defaultTo(10, Number(process.env.MAX_CONCURRENCY)),
        DEBUG: isDebug(),
    };
}

function assertEnvIsSet(key: string) {
    if (R.either(R.isNil, isEmptyString)(process.env[key])) {
        throw new Error(`Environment variable ${key} must be set`);
    }
}

function isEmptyString(s: string): boolean {
    return R.isEmpty(s.replace(/"/g, ''));
}
