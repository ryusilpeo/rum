import puter from "@heyputer/puter.js";
import {getOrCreateHostingConfig, uploadImageToHosting} from "./puter.hosting";
import {isHostedUrl} from "./utils";
import {PUTER_WORKER_URL} from "./constants";

export const signIn = async () => await puter.auth.signIn();

export const signOut = () => puter.auth.signOut();

export const getCurrentUser = async () => {
    try {
        return await puter.auth.getUser();
    } catch {
        return null;
    }
}

export const createProject = async ({ item, visibility = "private" }: CreateProjectParams): Promise<DesignItem | null | undefined> => {
    console.log('Starting createProject for item:', item.id);

    if(!PUTER_WORKER_URL) {
        console.warn('Missing VITE_PUTER_WORKER_URL; skip history fetch');
        return null;
    }

    const projectId = item.id;

    console.log('Getting hosting config...');
    const hosting = await getOrCreateHostingConfig();
    console.log('Hosting config:', hosting);

    let resolvedSource = item.sourceImage;
    if (projectId && !isHostedUrl(item.sourceImage)) {
        console.log('Uploading source image...');
        const hostedSource = await uploadImageToHosting({ hosting, url: item.sourceImage, projectId, label: 'source', });
        console.log('Hosted source:', hostedSource);
        if (hostedSource?.url) {
            resolvedSource = hostedSource.url;
        }
    }

    let resolvedRender = item.renderedImage;
    if (projectId && item.renderedImage && !isHostedUrl(item.renderedImage)) {
        console.log('Uploading rendered image...');
        const hostedRender = await uploadImageToHosting({ hosting, url: item.renderedImage, projectId, label: 'rendered', });
        console.log('Hosted render:', hostedRender);
        if (hostedRender?.url) {
            resolvedRender = hostedRender.url;
        }
    }

    const {
        sourcePath: _sourcePath,
        renderedPath: _renderedPath,
        publicPath: _publicPath,
        ...rest
    } = item;

    const payload = {
        ...rest,
        sourceImage: resolvedSource,
        renderedImage: resolvedRender,
    }

    try {
        console.log('Saving project to worker at:', `${PUTER_WORKER_URL}/api/projects/save`);
        const response = await puter.workers.exec(`${PUTER_WORKER_URL}/api/projects/save`, {
            method: 'POST',
            body: JSON.stringify({
                project: payload,
                visibility
            })
        });

        console.log('Worker response received:', response);

        if(!response.ok) {
            console.error('Failed to save the project. Response status:', response.status);
            console.error('Response text:', await response.text());
            return null;
        }

        const data = (await response.json()) as { project?: DesignItem | null }
        console.log('Parsed project data:', data);

        return data?.project ?? null;
    } catch (e) {
        console.error('Error during worker execution or parsing:', e);
        return null;
    }
}

export const getProjects = async () => {
    if(!PUTER_WORKER_URL) {
        console.warn('Missing VITE_PUTER_WORKER_URL; skip history fetch');
        return [];
    }

    try {
        const response = await puter.workers.exec(`${PUTER_WORKER_URL}/api/projects/list`, { method: 'GET' });

        if (!response.ok) {
            console.error('Failed to fetch history', await response.text());
            return [];
        }

        const data = (await response.json()) as { projects?: DesignItem[] | null };
        return Array.isArray(data?.projects) ? data?.projects : [];
    } catch (e) {
        console.error('Failed to get projects', e);
        return [];
    }
}

export const getProjectById = async ({ id }: { id: string }) => {
    if (!PUTER_WORKER_URL) {
        console.warn("Missing VITE_PUTER_WORKER_URL; skipping project fetch.");
        return null;
    }

    console.log("Fetching project with ID:", id);

    try {
        const response = await puter.workers.exec(
            `${PUTER_WORKER_URL}/api/projects/get?id=${encodeURIComponent(id)}`,
            { method: "GET" }
        );

        console.log("Fetch project response:", response);

        if (!response.ok) {
            console.error("Failed to fetch project:", await response.text());
            return null;
        }

        const data = (await response.json()) as {
            project?: DesignItem | null;
        };

        console.log("Fetched project data:", data);

        return data?.project ?? null;
    } catch (error) {
        console.error("Failed to fetch project:", error);
        return null;
    }
};