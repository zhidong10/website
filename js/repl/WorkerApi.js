// @flow

import PromiseWorker from "promise-worker";
import scopedEval from "./scopedEval";

import type { CompileConfig, PluginState, LoadScriptCallback } from "./types";

// $FlowFixMe
const WorkerSource = require("worker-loader?inline=true!./Worker");

type PromiseWorkerApi = {
  postMessage(message: Object): Promise<any>,
};

/**
 * Interfaces with a web worker to lazy-loads plugins and compile code.
 */
export default class WorkerApi {
  _worker: PromiseWorkerApi = new PromiseWorker(new WorkerSource());

  compile(code: string, config: CompileConfig) {
    return this._worker
      .postMessage({
        code,
        method: "compile",
        config,
      })
      .then(({ compiled, compileError, sourceMap }) => {
        let evalError = null;

        // Compilation is done in a web worker for performance reasons,
        // But eval requires the UI thread so code can access globals like window.
        if (config.evaluate) {
          try {
            scopedEval(compiled, sourceMap);
          } catch (error) {
            evalError = error.message;
          }
        }

        return {
          compiled,
          compileError,
          evalError,
          sourceMap,
        };
      });
  }

  loadPlugin(state: PluginState, callback: LoadScriptCallback) {
    const { config } = state;

    const base = config.baseUrl || "https://bundle.run";
    const url = `${base}/${config.package}@${config.version || ""}`;

    state.isLoading = true;

    this.loadScript(url, success => {
      if (success) {
        state.isLoaded = true;
        state.isLoading = false;
      } else {
        state.didError = true;
        state.isLoading = false;
      }

      callback(success);
    });
  }

  loadScript(url: string, callback: LoadScriptCallback) {
    this._worker
      .postMessage({
        method: "loadScript",
        url,
      })
      .then(success => {
        callback(success);
      });
  }

  registerEnvPreset(): Promise<boolean> {
    return this._worker.postMessage({
      method: "registerEnvPreset",
    });
  }
}
