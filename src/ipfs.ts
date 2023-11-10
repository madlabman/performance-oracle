import fs from 'fs/promises';
import { Readable } from 'stream';

import { shared as Shared } from './shared.js';

interface PinataPinResponse {
    IpfsHash: string;
    PinSize: number;
    Timestamp: string;
}

// TODO: local IPFS node required for the development and tests
export async function uploadFile(filename: string): Promise<PinataPinResponse> {
    const data = await fs.readFile(filename, 'utf8');
    return Shared.IPFS.pinFileToIPFS(Readable.from(data), {
        pinataMetadata: {
            name: 'eth2-fees',
        },
    });
}

export async function catCID(cid: string): Promise<string> {
    const r = await fetch(`https://ipfs.io/ipfs/${cid}`);
    return await r.text();
}
