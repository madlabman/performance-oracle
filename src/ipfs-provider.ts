import pinata from '@pinata/sdk';

import { Config } from './types.js';

export function getIpfsClient(c: Config) {
    return new (pinata as any)({
        pinataApiKey: c.PINATA_API_KEY,
        pinataSecretApiKey: c.PINATA_SECRET_API_KEY,
    });
}
