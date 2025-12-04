/**
 * Shared progress tracking utility for experiments
 *
 * Provides a unified progress tracker with:
 * - Step-by-step progress visualization
 * - Sub-step progress updates
 * - Time elapsed and ETA estimation
 */

class ProgressTracker {
  constructor(totalSteps) {
    this.totalSteps = totalSteps;
    this.currentStep = 0;
    this.startTime = Date.now();
    this.stepStartTime = Date.now();
    this.stepTimings = [];
    this.subStepMode = false;
  }

  startStep(stepName) {
    this.currentStep++;
    this.stepStartTime = Date.now();
    this.currentStepName = stepName;
    this.subStepMode = false;
    this._displayProgress();
  }

  completeStep() {
    const stepDuration = Date.now() - this.stepStartTime;
    this.stepTimings.push(stepDuration);
    this.subStepMode = false;
    this._displayProgress(true);
  }

  updateSubProgress(current, total, extraInfo = '') {
    this.subStepMode = true;
    this.subStepCurrent = current;
    this.subStepTotal = total;
    this.subStepInfo = extraInfo;
    this._displayProgress(false, true);
  }

  _displayProgress(completed = false, isSubStep = false) {
    const elapsed = Date.now() - this.startTime;
    const elapsedSeconds = Math.floor(elapsed / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const elapsedSecondsRemainder = elapsedSeconds % 60;

    const percentage = ((this.currentStep / this.totalSteps) * 100).toFixed(1);
    const progressBar = this._generateProgressBar(this.currentStep, this.totalSteps);

    let timeEstimate = '';
    if (this.stepTimings.length > 0 && this.currentStep < this.totalSteps) {
      const avgStepTime = this.stepTimings.reduce((a, b) => a + b, 0) / this.stepTimings.length;
      const remainingSteps = this.totalSteps - this.currentStep;
      const estimatedRemainingTime = avgStepTime * remainingSteps;
      const estMinutes = Math.floor(estimatedRemainingTime / 60000);
      const estSeconds = Math.floor((estimatedRemainingTime % 60000) / 1000);
      timeEstimate = ` | ETA: ${estMinutes}m ${estSeconds}s`;
    }

    const status = completed ? '✓' : '▶';

    if (isSubStep && this.subStepMode) {
      // Display sub-step progress with fine-grained ETA
      const subPercentage = ((this.subStepCurrent / this.subStepTotal) * 100).toFixed(1);
      const subProgressBar = this._generateProgressBar(this.subStepCurrent, this.subStepTotal, 20);

      // Calculate ETA based on current sub-step progress
      const stepElapsed = Date.now() - this.stepStartTime;
      let subTimeEstimate = '';
      if (this.subStepCurrent > 0 && this.subStepCurrent < this.subStepTotal) {
        const avgTimePerSubStep = stepElapsed / this.subStepCurrent;
        const remainingSubSteps = this.subStepTotal - this.subStepCurrent;
        const estRemainingTime = avgTimePerSubStep * remainingSubSteps;
        const estMin = Math.floor(estRemainingTime / 60000);
        const estSec = Math.floor((estRemainingTime % 60000) / 1000);
        subTimeEstimate = ` | ETA: ${estMin}m ${estSec}s`;
      }

      // Use \r to overwrite the same line for sub-progress updates
      process.stdout.write(`\r${status} [${this.currentStep}/${this.totalSteps}] ${progressBar} ${percentage}% | ${this.currentStepName}`);
      process.stdout.write(`\n   └─ [${this.subStepCurrent}/${this.subStepTotal}] ${subProgressBar} ${subPercentage}%${this.subStepInfo}${subTimeEstimate}${' '.repeat(20)}`);
    } else {
      console.log(`\n${status} [${this.currentStep}/${this.totalSteps}] ${progressBar} ${percentage}% | ${this.currentStepName}`);
      console.log(`   Time elapsed: ${elapsedMinutes}m ${elapsedSecondsRemainder}s${timeEstimate}`);
    }
  }

  _generateProgressBar(current, total, width = 30) {
    const filled = Math.floor((current / total) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  complete() {
    const totalTime = Date.now() - this.startTime;
    const totalMinutes = Math.floor(totalTime / 60000);
    const totalSeconds = Math.floor((totalTime % 60000) / 1000);
    console.log(`\n\n✓ All steps completed in ${totalMinutes}m ${totalSeconds}s`);
  }
}

module.exports = { ProgressTracker };
