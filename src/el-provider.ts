import { ethers } from 'ethers';

import { Config } from './types.js';

// TODO: need retries + rate limiting
export function getProvider(c: Config): ethers.Provider {
    return new ethers.JsonRpcProvider(c.EL_URI);
}
