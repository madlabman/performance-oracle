import fs from 'fs/promises';
import path from 'path';

import { Epoch } from '@lodestar/types';
import { parse, stringify } from 'yaml';

import { shared as Shared } from './shared.js';
import { Artifact } from './types.js';

export function fromString(s: string): Artifact {
    // TODO: validate schema of artifact
    return parse(s) as Artifact;
}

export async function saveArtifact(a: Artifact): Promise<string> {
    try {
        await fs.access(Shared.CONFIG.ARTIFACTS_DIR);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }

        await fs.mkdir(Shared.CONFIG.ARTIFACTS_DIR, { recursive: true });
    }
    const filename = getFilename(a.sourceEpoch, a.targetEpoch);
    await fs.writeFile(filename, toString(a), 'utf8');
    return filename;
}

export async function artifactExists(
    sourceEpoch: Epoch,
    targetEpoch: Epoch,
): Promise<boolean> {
    try {
        await fs.access(getFilename(sourceEpoch, targetEpoch));
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }

        return false;
    }

    return true;
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
