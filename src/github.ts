import {Octokit} from "@octokit/core";
import * as core from "@actions/core";
import {getOctokitOptions, GitHub} from "@actions/github/lib/utils";
import {throttling} from "@octokit/plugin-throttling";

const ThrottlingOctokit = GitHub.plugin(throttling);

export function getOctokit(token: string): Octokit {
    return new ThrottlingOctokit({
        throttle: {
            onRateLimit: (retryAfter, options) => {
                core.warning(
                    `RateLimit detected for request ${options.method} ${options.url}.`
                );
                core.info(`Retrying after ${retryAfter} seconds.`);
                return true;
            },
            onSecondaryRateLimit: (retryAfter, options) => {
                core.warning(
                    `SecondaryRateLimit detected for request ${options.method} ${options.url}.`
                );
                core.info(`Retrying after ${retryAfter} seconds.`);
                return true;
            },
        },
        ...getOctokitOptions(token),
    });
}