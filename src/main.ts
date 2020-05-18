import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as os from "os";

const mkdirp = require("mkdirp-promise");

async function run() {
    try {
        const version = core.getInput("version");
        if (version == undefined) {
            core.setFailed("version not specified");
            return;
        }

        const destination = "/home/runner/.tf2pulumi";
        await mkdirp(destination);

        let osPlatform = os.platform();
        if (osPlatform != "linux" && osPlatform != "darwin") {
            core.setFailed("Unsupported operating system - tf2pulumi is only released for Darwin and Linux");
            return;
        }

        const url = `https://github.com/pulumi/tf2pulumi/releases/download/v${version}/tf2pulumi-v${version}-${osPlatform}-x64.tar.gz`
        const tf2pulumiPath = await tc.downloadTool(url);
        const extractedPath = await tc.extractTar(tf2pulumiPath, destination);

        core.addPath(extractedPath);
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
