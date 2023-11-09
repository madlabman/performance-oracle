import fs from 'fs';
import path from 'path';

import { Epoch } from '@lodestar/types';
import { parse, stringify } from 'yaml';

import { shared as Shared } from './shared.js';
import { Artifact } from './types.js';

export function fromString(s: string): Artifact {
    // TODO: validate schema of artifact
    return parse(s) as Artifact;
}

export function saveArtifact(a: Artifact): string {
    if (!fs.existsSync(Shared.CONFIG.ARTIFACTS_DIR)) {
        fs.mkdirSync(Shared.CONFIG.ARTIFACTS_DIR, { recursive: true });
    }
    const filename = getFilename(a.sourceEpoch, a.targetEpoch);
    fs.writeFileSync(filename, toString(a), 'utf8');
    return filename;
}

export function artifactExists(
    sourceEpoch: Epoch,
    targetEpoch: Epoch,
): boolean {
    return fs.existsSync(getFilename(sourceEpoch, targetEpoch));
}

function getFilename(sourceEpoch: Epoch, targetEpoch: Epoch): string {
    return path.join(
        Shared.CONFIG.ARTIFACTS_DIR,
        `${sourceEpoch}-${targetEpoch}.yaml`,
    );
}

function toString(a: Artifact): string {
    const data = {
        distributed: a.distributed,
        sourceEpoch: a.sourceEpoch,
        targetEpoch: a.targetEpoch,
        tree: a.tree.dump(),
    };
    return stringify(data);
}
