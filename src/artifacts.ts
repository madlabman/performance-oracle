import fs from 'fs';
import path from 'path';

import { Epoch } from '@lodestar/types';

import { toFile } from './merkle.js';
import { shared as Shared } from './shared.js';
import { MerkleTree } from './types.js';

export function readArtifact(sourceEpoch: Epoch, targetEpoch: Epoch) {
    const filename = getFilename(sourceEpoch, targetEpoch);
    if (!artifactExists(filename)) {
        return null;
    }

    return fs.readFileSync(filename, 'utf8');
}

export function saveArtifact(
    sourceEpoch: Epoch,
    targetEpoch: Epoch,
    t: MerkleTree,
) {
    if (!fs.existsSync(Shared.CONFIG.ARTIFACTS_DIR)) {
        fs.mkdirSync(Shared.CONFIG.ARTIFACTS_DIR, { recursive: true });
    }
    const filename = getFilename(sourceEpoch, targetEpoch);
    toFile(t, filename);
}

export function artifactExists(f: string) {
    return fs.existsSync(f);
}

function getFilename(sourceEpoch: Epoch, targetEpoch: Epoch) {
    return path.join(
        Shared.CONFIG.ARTIFACTS_DIR,
        `${sourceEpoch}-${targetEpoch}.yaml`,
    );
}
