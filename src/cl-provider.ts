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
            config: etherConfig,
        },
    );
}
