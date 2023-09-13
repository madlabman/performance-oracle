import { Wallet } from 'ethers';
import * as R from 'ramda';

import { getProvider as getClProvider } from './cl-provider.js';
import { getConfig } from './config.js';
import { getProvider as getElProvider } from './el-provider.js';
import { getIpfsClient } from './ipfs-provider.js';
import { Oracle, Oracle__factory, StETH__factory } from './typechain/index.js';

class Shared {
    get CONFIG() {
        return this.singleton(getConfig, Symbol.for('CONFIG'));
    }

    get EL() {
        return this.singleton(
            // @ts-ignore
            R.partial(getElProvider, [this.CONFIG]),
            Symbol.for('EL'),
        );
    }

    get CL() {
        return this.singleton(
            // @ts-ignore
            R.partial(getClProvider, [this.CONFIG]),
            Symbol.for('CL'),
        );
    }

    get IPFS() {
        return this.singleton(
            // @ts-ignore
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
        const self = this;

        function connectOracle(): Oracle {
            return Oracle__factory.connect(self.CONFIG.ORACLE_ADDRESS, self.EL);
        }

        return this.singleton(connectOracle, Symbol.for('ORACLE'));
    }

    get STETH() {
        const self = this;

        function connectStETH() {
            return StETH__factory.connect(self.CONFIG.STETH_ADDRESS, self.EL);
        }

        return this.singleton(connectStETH, Symbol.for('STETH'));
    }

    singleton<T>(f: () => T, s: symbol): T {
        if (R.isNil(globalThis[s])) {
            globalThis[s] = f();
        }
        return globalThis[s];
    }
}

export const shared = new Shared();
