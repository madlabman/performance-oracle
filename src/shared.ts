import { Wallet } from 'ethers';
import * as R from 'ramda';

import { getProvider as getClProvider } from './cl-provider.js';
import { getConfig } from './config.js';
import { getProvider as getElProvider } from './el-provider.js';
import { getIpfsClient } from './ipfs-provider.js';
import {
    HashConsensus__factory,
    Oracle__factory,
    StETH__factory,
} from './typechain/index.js';

class Shared {
    CONSENSUS_VERSION = 1;
    CONTRACT_VERSION = 1;

    get CONFIG() {
        return this.singleton(getConfig, Symbol.for('CONFIG'));
    }

    get EL() {
        return this.singleton(
            R.partial(getElProvider, [this.CONFIG]),
            Symbol.for('EL'),
        );
    }

    get CL() {
        return this.singleton(
            R.partial(getClProvider, [this.CONFIG]),
            Symbol.for('CL'),
        );
    }

    get IPFS() {
        return this.singleton(
            R.partial(getIpfsClient, [this.CONFIG]),
            Symbol.for('IPFS'),
        );
    }

    get SIGNER() {
        return this.singleton(
            () => new Wallet(this.CONFIG.SIGNER_KEY, this.EL),
            Symbol.for('SIGNER'),
        );
    }

    get ORACLE() {
        return this.singleton(
            () => Oracle__factory.connect(this.CONFIG.ORACLE_ADDRESS, this.EL),
            Symbol.for('ORACLE'),
        );
    }

    get HASHCONSENSUS() {
        return this.singleton(
            () =>
                HashConsensus__factory.connect(
                    this.CONFIG.CONSENSUS_ADDRESS,
                    this.EL,
                ),
            Symbol.for('HASHCONSENSUS'),
        );
    }

    get STETH() {
        return this.singleton(
            () => StETH__factory.connect(this.CONFIG.STETH_ADDRESS, this.EL),
            Symbol.for('STETH'),
        );
    }

    singleton<T>(f: (...args: unknown[]) => T, s: symbol): T {
        if (R.isNil(globalThis[s])) {
            globalThis[s] = f();
        }
        return globalThis[s];
    }
}

export const shared = new Shared();
