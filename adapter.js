import logger from "yeoman-environment/lib/util/log";
import inquirer from "inquirer";

function DummyPrompt(question) {
    this.question = question;
}

DummyPrompt.prototype.run = function () {
    // console.log(this.question)
    let result;
    if (this.question.type === 'expand') {
        result = 'write';
    } else {
        result = true;
    }
    return Promise.resolve(result);
};

export class Adapter {
    constructor() {
        this.promptModule = inquirer.createPromptModule();
        Object.keys(this.promptModule.prompts).forEach(function (promptName) {
            this.promptModule.registerPrompt(promptName, DummyPrompt);
        }, this);
        this.log = logger();
    }

    diff() {
        return "diff";
    }

    prompt(questions, answers, cb) {
        if (typeof answers === 'function') {
          cb = answers;
          answers = undefined;
        }
        const promise = this.promptModule(questions, answers);
        if (typeof cb === 'function') {
          promise.then(answers => cb(answers));
        }
        return promise;
      }
}
