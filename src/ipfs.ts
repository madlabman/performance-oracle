import { Readable } from 'stream';

import { CID } from 'ipfs-http-client';

import { toString } from './merkle.js';
import { shared as Shared } from './shared.js';
import { MerkleTree } from './types.js';

// TODO: local IPFS node required for the development and tests
export async function uploadTree(t: MerkleTree): Promise<CID> {
    const data = toString(t);

    return Shared.IPFS.pinFileToIPFS(Readable.from(data), {
        pinataMetadata: {
            name: 'eth2-fees',
        },
    });
}

export async function catCID(cid: string): Promise<string> {
    const r = await fetch(`https://ipfs.io/ipfs/${cid}`);
    return await r.text();
    return `format: standard-v1
tree:
  - "0x0bacf9872257b73f22a493cce6753fb47138122f77bfa1e061d260e637a11f48"
  - "0xf7fb8486697d264b7cb353e6eba1dff304032ea62ae59d35e972e101a4995284"
  - "0xa1ef65d7cc911728cb5464439d8cced2b0ecf9ce198fd2b68281aae7bb09f47f"
  - "0xfa61b2d2984064ab94afa087b9f359041b49bf143e3bce3140eacac9b2baf42b"
  - "0xd46eec5005a1163891f37dc8e06bf8f5e122ceae1bce5c20f45615337f455373"
  - "0x623dcda3693bcd5b1c292724b7388eb4c637eac66d7d1636939f8df632152010"
  - "0x25882365f32542cf4b9face13ef992b9f4e825426cfbf94348c94d516a2d5f7d"
values:
  - value:
      - 833668
      - 25000000000000000
    treeIndex: 5
  - value:
      - 792358
      - 25000000000000000
    treeIndex: 3
  - value:
      - 284444
      - 25000000000000000
    treeIndex: 4
  - value:
      - 63268
      - 25000000000000000
    treeIndex: 6
leafEncoding:
  - uint64
  - uint256
  `;
}
