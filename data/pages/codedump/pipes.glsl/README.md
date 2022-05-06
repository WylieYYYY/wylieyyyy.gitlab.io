# pipes.glsl

A GLSL fragment shader that renders the classic pipes screensaver procedurally.
Weekend project to get a new procedurally generated screensaver for phones.

## How to use it

This is created to be used with the [Shader Editor App][app] by Markus Fisch.
Properties of the pipe can be modified in the `config` region of the file.
The screensaver and wallpaper can be applied with these simple steps:

 1. Click `New shader`
 2. Copy and paste the content into the editor
 3. Click `Save shader` and click `Set as wallpaper`
 4. Follow the instruction on screen

Tada!

## Technical detail

Fragment shader is not the optimal way to perform this task,
but it can be run everywhere with online shader sharing platform with tweaking.
Also, it is one of the easier ways to create a procedurally generated
screensaver.

### General flow of execution

When initializing (time < 0.1):
 - Aggregate entropy and randomize palette using a few frames (1 per 10fps)
 - store the randomized palette with out of bounds pipe head in data pixel

For each frame:
 - unpack the pipe head from the data pixel
 - simulate the next pipe head to see if the current cell needs a curved pipe
 - draw the cell
 - store new random seed with simulation result back to the data pixel

> All above are executed in parallel for each pixel.

### Debugging and testing

The codes are separated by `region` and `endregion` pragmas,
which can be used for folding sections of code in "Code - OSS"
after renaming the file to a `.c` extension.

`SHADER_TOY` detection is for compatibility with the ShaderToy extension for
debugging purpose, the shader should run within the extension without error
after removing the `#version` directive.

Basic testing for packing and unpacking is included in the same file,
and can be activated by uncommenting `#define UNIT_TEST` at the start of file.
The screen should be green if tests are run without error, red otherwise.

> It may be bloat to publish the shader with the unit test attached.

### Persistent storage across frames

To persist the details of the head of the pipe, this shader uses a data pixel
at the corner (0, 0). The details are converted to range [0, 1) before storing:

 - Red is the x component of the cell position UV
 - Green is the y component of the cell position UV
 - Blue is packed with palette index and the direction of the pipe
 - Alpha is the random seed

> The red and green channel will be 1 exactly once after initialization
> to force the pipe head to reset to a new position.

### Randomness

The `random()` function will output the same sequence in the same frame for each
pixel, it is reseeded with `time` and the previous seed only after each frame.
It is to keep branching and simulation consistent for all pixels.

## License

```
MIT License

Copyright (c) 2022 Yuen Tsang Yin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

[app]: https://f-droid.org/en/packages/de.markusfisch.android.shadereditor/
