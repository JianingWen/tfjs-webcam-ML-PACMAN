/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import * as tf from '@tensorflow/tfjs';
import * as tfd from '@tensorflow/tfjs-data';

import {ControllerDataset} from './controller_dataset';
import * as ui from './ui';

// The number of classes we want to predict. In this example, we will be
// predicting 4 classes for up, down, left, and right.
const NUM_CLASSES = 4;

// A webcam iterator that generates Tensors from the images from the webcam.
let webcam;

// The dataset object where we will store activations.
const controllerDataset = new ControllerDataset(NUM_CLASSES);

let truncatedMobileNet;
let model;

// Loads mobilenet and returns a model that returns the internal activation
// we'll use as input to our classifier model.
async function loadTruncatedMobileNet() {
  const mobilenet = await tf.loadLayersModel(
      'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json');

  // Return a model that outputs an internal activation.
  const layer = mobilenet.getLayer('conv_pw_13_relu');
  return tf.model({inputs: mobilenet.inputs, outputs: layer.output});
}

// When the UI buttons are pressed, read a frame from the webcam and associate
// it with the class label given by the button. up, down, left, right are
// labels 0, 1, 2, 3 respectively.
ui.setExampleHandler(async label => {
  let img = await getImage();
  // console.log("img in add: ", img)
  controllerDataset.addExample(truncatedMobileNet.predict(img), label);

  // Draw the preview thumbnail.
  ui.drawThumb(img, label);
  img.dispose();
})

ui.setDeleteExampleHandler(async label => {
  let img = await getLastImage();
  // console.log("img in delete: ", img)
  // console.log("label: ", label)

  controllerDataset.deleteExample(img, label);
  img.dispose();

  // TODO: I want to show the second last image of this class (currently not handle this situation)
  // Draw the next available img for the same label
  let nextImg = await getImage(label);
  if (nextImg) {
    // If there is another image (the total sample for this class is not 0)
    ui.drawThumb(nextImg, label); 
    nextImg.dispose(); 
  } 
  else {
    // If no more images are available (the total sample for this class is 0)
    console.log("No more images available under this label.");
  }

  // // Draw the preview thumbnail.
  // ui.drawThumb(img, label);
  // img.dispose();
})

/**
 * Sets up and trains the classifier.
 */
async function train() {
  if (controllerDataset.xs == null) {
    throw new Error('Add some examples before training!');
  }

  // Creates a 2-layer fully connected model. By creating a separate model,
  // rather than adding layers to the mobilenet model, we "freeze" the weights
  // of the mobilenet model, and only train weights from the new model.
  model = tf.sequential({
    layers: [
      // Flattens the input to a vector so we can use it in a dense layer. While
      // technically a layer, this only performs a reshape (and has no training
      // parameters).
      tf.layers.flatten(
          {inputShape: truncatedMobileNet.outputs[0].shape.slice(1)}),
      // Layer 1.
      tf.layers.dense({
        units: ui.getDenseUnits(),
        activation: 'relu',
        kernelInitializer: 'varianceScaling',
        useBias: true
      }),
      // Layer 2. The number of units of the last layer should correspond
      // to the number of classes we want to predict.
      tf.layers.dense({
        units: NUM_CLASSES,
        kernelInitializer: 'varianceScaling',
        useBias: false,
        activation: 'softmax'
      })
    ]
  });

  // Creates the optimizers which drives training of the model.
  const optimizer = tf.train.adam(ui.getLearningRate());
  // We use categoricalCrossentropy which is the loss function we use for
  // categorical classification which measures the error between our predicted
  // probability distribution over classes (probability that an input is of each
  // class), versus the label (100% probability in the true class)>
  model.compile({optimizer: optimizer, loss: 'categoricalCrossentropy'});

  // We parameterize batch size as a fraction of the entire dataset because the
  // number of examples that are collected depends on how many examples the user
  // collects. This allows us to have a flexible batch size.
  const batchSize =
      Math.floor(controllerDataset.xs.shape[0] * ui.getBatchSizeFraction());
  if (!(batchSize > 0)) {
    throw new Error(
        `Batch size is 0 or NaN. Please choose a non-zero fraction.`);
  }

  // Train the model! Model.fit() will shuffle xs & ys so we don't have to.
  model.fit(controllerDataset.xs, controllerDataset.ys, {
    batchSize,
    epochs: ui.getEpochs(),
    callbacks: {
      onBatchEnd: async (batch, logs) => {
        ui.trainStatus('Loss: ' + logs.loss.toFixed(5));
      }
    }
  });
}

let isPredicting = false;

async function predict() {
  ui.isPredicting();
  while (isPredicting) {
    // Capture the frame from the webcam.
    const img = await getImage();

    // Make a prediction through mobilenet, getting the internal activation of
    // the mobilenet model, i.e., "embeddings" of the input images.
    const embeddings = truncatedMobileNet.predict(img);

    // Make a prediction through our newly-trained model using the embeddings
    // from mobilenet as input.
    const predictions = model.predict(embeddings);

    // Returns the index with the maximum probability. This number corresponds
    // to the class the model thinks is the most probable given the input.
    const predictedClass = predictions.as1D().argMax();
    const classId = (await predictedClass.data())[0];
    img.dispose();

    ui.predictClass(classId);
    await tf.nextFrame();
  }
  ui.donePredicting();
}

let imageCollected = [];
/**
 * Captures a frame from the webcam and normalizes it between -1 and 1.
 * Returns a batched image (1-element batch) of shape [1, w, h, c].
 */
async function getImage() {
  const img = await webcam.capture();
  const processedImg =
      tf.tidy(() => img.expandDims(0).toFloat().div(127).sub(1));

  // console.log("processedImg: ", processedImg)
  imageCollected.push(processedImg);

  img.dispose();
  return processedImg;
}

async function getLastImage() {
  if (imageCollected.length > 0) {
    lastImage = imageCollected.pop()
    // console.log("lastImage: ", lastImage)
    return lastImage; 
  } 
  else {
    console.error('No images captured yet.');
    return null;
  }
}

document.getElementById('train').addEventListener('click', async () => {
  ui.trainStatus('Training...');
  await tf.nextFrame();
  await tf.nextFrame();
  isPredicting = false;
  train();
});
document.getElementById('predict').addEventListener('click', () => {
  ui.startPacman();
  isPredicting = true;
  predict();
});

async function init() {
  try {
    webcam = await tfd.webcam(document.getElementById('webcam'));
  } catch (e) {
    console.log(e);
    document.getElementById('no-webcam').style.display = 'block';
  }
  truncatedMobileNet = await loadTruncatedMobileNet();

  ui.init();

  // Warm up the model. This uploads weights to the GPU and compiles the WebGL
  // programs so the first time we collect data from the webcam it will be
  // quick.
  const screenShot = await webcam.capture();
  truncatedMobileNet.predict(screenShot.expandDims(0));
  screenShot.dispose();
}

// Initialize the application.
init();
