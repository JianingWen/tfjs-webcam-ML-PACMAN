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

/**
 * A dataset for webcam controls which allows the user to add example Tensors
 * for particular labels. This object will concat them into two large xs and ys.
 */
export class ControllerDataset {
  constructor(numClasses) {
    this.numClasses = numClasses;
  }

  /**
   * Adds an example to the controller dataset.
   * @param {Tensor} example A tensor representing the example. It can be an image,
   *     an activation, or any other type of Tensor.
   * @param {number} label The label of the example. Should be a number.
   */
  addExample(example, label) {
    // console.log("example: ", example)
    // console.log("label: ", label)

    // One-hot encode the label.
    const y = tf.tidy(
        () => tf.oneHot(tf.tensor1d([label]).toInt(), this.numClasses));

    if (this.xs == null) {
      // For the first example that gets added, keep example and y so that the
      // ControllerDataset owns the memory of the inputs. This makes sure that
      // if addExample() is called in a tf.tidy(), these Tensors will not get
      // disposed.
      this.xs = tf.keep(example);
      this.ys = tf.keep(y);
    } else {
      const oldX = this.xs;
      // console.log(this.xs.shape);
      this.xs = tf.keep(oldX.concat(example, 0));

      const oldY = this.ys;
      this.ys = tf.keep(oldY.concat(y, 0));

      oldX.dispose();
      oldY.dispose();
      y.dispose();
    }
    console.log(this.xs.shape)
    console.log(this.ys.shape)
  }

  deleteExample(example, label) {
    // console.log("example: ", example)
    // console.log("label: ", label)
    // console.log("this.xs: ", this.xs)
    // console.log("this.ys: ", this.ys)
    // console.log(this.xs.shape)
    // console.log(this.ys.shape)

    // Case1: There is no data be added yet
    if (this.xs == null || this.ys == null || this.xs.shape[0] === 0 || this.ys.shape[0] === 0) {
      console.log("No examples be added yet.");
      return;
    }

    // Case2: There is one data in dataset => (clean all tensor here)
    if (this.xs.shape[0] === 1) {
      // console.log("this.xs: ", this.xs)
      // console.log("this.ys: ", this.ys)
      this.xs.dispose();  
      this.ys.dispose(); 
      this.xs = null;  
      this.ys = null; 
      
      console.log('No examples in dataste right now.');
      return;
    }

    // Case3: There is more tha n one example in dataset => keep the tensor with one less example(not include the last one)
    tf.tidy(() => {
      // console.log(this.xs.shape)
      // console.log(this.ys.shape)
     
      // create a new tensor (not include the last one by slice it off)
      const newX = this.xs.slice([0], [this.xs.shape[0] - 1]);  
      const newY = this.ys.slice([0], [this.ys.shape[0] - 1]);  

      // Dispose the old tensor holding all examples and labels
      this.xs.dispose();   
      this.ys.dispose();  

      // Keep the new tensor
      this.xs = tf.keep(newX);   
      this.ys = tf.keep(newY);  

      console.log(this.xs.shape)
      console.log(this.ys.shape)
    });
  }

}
