import { getClient } from '@lodestar/api';
import { config as etherConfig } from '@lodestar/config/default';

import { Config } from './types.js';

// TODO: retries and fallbacks
export function getProvider(c: Config) {
    return getClient(
        {
            baseUrl: c.CL_URI,
            timeoutMs: c.CL_TIMEOUT,
        },
        {
            // TODO: probably shoulde pluggable denepending on the chain
            config: etherConfig,
        },
    );
}
