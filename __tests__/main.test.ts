/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * These should be run as if the action was called from a workflow.
 * Specifically, the inputs listed in `action.yml` should be set as environment
 * variables following the pattern `INPUT_<INPUT_NAME>`.
 */

import * as core from '@actions/core'
import * as main from '../src/main'
import * as octokit from "@octokit/core";
import * as os from "os";
import * as path from "path";
import * as github from "../src/github";
import * as tc from "@actions/tool-cache";
import fs from "fs";
import {OutgoingHttpHeaders} from "http";


// Mock the action's main function
const runMock = jest.spyOn(main, 'run')

// Other utilities
const timeRegex = /^\d{2}:\d{2}:\d{2}/

// Mock the GitHub Actions core library
let debugMock: jest.SpiedFunction<typeof core.debug>
let errorMock: jest.SpiedFunction<typeof core.error>
let getInputMock: jest.SpiedFunction<typeof core.getInput>
let setFailedMock: jest.SpiedFunction<typeof core.setFailed>
let setOutputMock: jest.SpiedFunction<typeof core.setOutput>
let octokitMock: jest.SpiedFunction<typeof github.getOctokit>
let cacheMock: jest.SpiedFunction<typeof tc.downloadTool>

describe('action', () => {
    beforeEach(() => {
        jest.clearAllMocks()

        debugMock = jest.spyOn(core, 'debug').mockImplementation()
        errorMock = jest.spyOn(core, 'error').mockImplementation()
        getInputMock = jest.spyOn(core, 'getInput').mockImplementation()
        setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
        setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation()
        octokitMock = jest.spyOn(github, 'getOctokit').mockImplementation()
        cacheMock = jest.spyOn(tc, 'downloadTool').mockImplementation()

        process.env['RUNNER_TOOL_CACHE'] = os.tmpdir()
    })

    it('sets the time output', async () => {
        // Set the action's inputs as return values from core.getInput()
        getInputMock.mockImplementation(name => {
            switch (name) {
                case 'token':
                    return 'random-token'
                case 'config':
                    return `
aquasecurity/tfsec:        
  tag: v1.18.0
  platform: linux
  arch: amd64
  extension-matching: true
jaxxstorm/connecti: 
jaxxstorm/change-aws-credentials: v0.4.0
wasmerio/wasmer: {}
`
                default:
                    return ''
            }
        })

        let getReleaseCallback = jest.fn().mockImplementation((inputs) => {
            let releases_map = {
                'connecti': 'connecti.latest.json',
                'wasmer': 'wasmer.latest.json',
                'change-aws-credentials': 'change-aws-credentials.v1.18.0.json',
                'tfsec': 'tfsec.v1.18.0.json',
            }

            let file_name = releases_map[inputs.repo]
            return {data: JSON.parse(fs.readFileSync("__tests__/fixtures/" + file_name, 'utf8'))}
        })

        octokitMock.mockImplementation(token => {
            return {
                rest: {
                    repos: {
                        getLatestRelease: getReleaseCallback,
                        getReleaseByTag: getReleaseCallback
                    }
                }
            } as unknown as octokit.Octokit
        })

        cacheMock.mockImplementation( async (url: string, dest?: string, auth?: string, headers?: OutgoingHttpHeaders) => {
            const tmpdir = os.tmpdir();
            let filepath = ""
            let assets_map = {
                'https://api.github.com/repos/aquasecurity/tfsec/releases/assets/61868894': 'tfsec_1.18.0_linux_amd64.tar.gz',
                'https://api.github.com/repos/jaxxstorm/connecti/releases/assets/149202162': 'connecti-v0.0.4-linux-amd64.tar.gz',
                'https://api.github.com/repos/jaxxstorm/connecti/releases/assets/149202168': 'connecti-v0.0.4-darwin-amd64.tar.gz',
                'https://api.github.com/repos/jaxxstorm/change-aws-credentials/releases/assets/99210534': 'change-aws-credentials-v0.4.0-linux-amd64.tar.gz',
                'https://api.github.com/repos/jaxxstorm/change-aws-credentials/releases/assets/99210524': 'change-aws-credentials-v0.4.0-darwin-amd64.tar.gz',
                'https://api.github.com/repos/wasmerio/wasmer/releases/assets/179961884': 'wasmer-linux-amd64.tar.gz',
                'https://api.github.com/repos/wasmerio/wasmer/releases/assets/179961899': 'wasmer-darwin-amd64.tar.gz'
            }
            filepath = path.join(tmpdir, assets_map[url]);
            fs.copyFile("__tests__/fixtures/assets.tar.gz", filepath,
                (err) => { if (err) throw err; }
            );
            return filepath

        })

        await main.run()
        expect(octokitMock).toHaveBeenCalled()
        expect(cacheMock).toHaveBeenCalled()
        expect(runMock).toHaveReturned()

        expect(errorMock).not.toHaveBeenCalled()
        expect(setFailedMock).not.toHaveBeenCalled()
    })

    it('sets a failed status', async () => {
        // Set the action's inputs as return values from core.getInput()
        getInputMock.mockImplementation(name => {
            switch (name) {
                case 'token':
                    return 'random-token'
                case 'config':
                    return 'test'
                default:
                    return ''
            }
        })

        await main.run()
        expect(runMock).toHaveReturned()

        // Verify that all of the core library functions were called correctly
        expect(setFailedMock).toHaveBeenNthCalledWith(
            1,
            'data must be object'
        )
        expect(errorMock).not.toHaveBeenCalled()
    })
})
