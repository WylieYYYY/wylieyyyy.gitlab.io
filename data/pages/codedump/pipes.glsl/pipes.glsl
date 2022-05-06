/* Under MIT license, notice at the end of the corresponding markdown file. */

// ES versions for the app
#version 300 es
precision highp float;
// enable unit tests for packing and unpacking
// #define UNIT_TEST

#pragma region config
// a set of colors to be used for pipes
#define paletteCount 7
// storage for color palette
vec4[paletteCount] getPalette() {
	vec4 palette[paletteCount];
	for (int i = 1; i <= 7; i++) palette[i - 1] = vec4(i & 4, i & 2, i & 1, 1.0);
	return palette;
}
// the amount of cells for the short edge
int cellsPerEdge = 15;
// probability of the pipe going forward
float forwardChance = 0.85;
// get the pixel value, pipeId is the type of pipe to render
// uv is the space from 0.0 to 1.0 within one cell
vec4 getPipePixel(ivec2 pipeId, vec2 uv, int paletteIdx) {
	vec4 color = getPalette()[paletteIdx];
	// horizontal component rendering needed, check within line width
	if (pipeId.x != 0 && abs(uv.y - 0.5) < 0.1) {
		if ((pipeId.y == 0 || pipeId.x == -1) && uv.x < 0.6) return color;
		if ((pipeId.y == 0 || pipeId.x == 1) && uv.x >= 0.4) return color;
		// if vertical component is 0, it means that the pipe goes all the way
	}
	// vertical component rendering needed, check within line width
	if (pipeId.y != 0 && abs(uv.x - 0.5) < 0.1) {
		if ((pipeId.x == 0 || pipeId.y == -1) && uv.y < 0.6) return color;
		if ((pipeId.x == 0 || pipeId.y == 1) && uv.y >= 0.4) return color;
		// if horizontal component is 0, it means that the pipe goes all the way
	}
	// pixel not reached by the line, render background
	return vec4(0.0, 0.0, 0.0, 1.0);
}
#pragma endregion

#pragma region stdlib
uniform float time;
uniform vec2 resolution;
uniform sampler2D backbuffer;
#ifndef SHADER_TOY
	out vec4 gl_FragColor;
#endif
// compatibility layer
#ifdef SHADER_TOY
	#iChannel0 "self"
	#define resolution iResolution.xy
	#define backbuffer iChannel0
#endif
// the last output to feed into the random function to get a predictable outcome
float seed = 0.0;
// the okay random, we do not need *good* distribution, we only need *any*
float random() {
	seed = cos(seed) * exp(10.0);
	return fract(seed);
}
// pack a 2d vector into a float value range from 0.0 to 1.0 (for small max)
float packToUnit(ivec2 value, ivec2 max) {
	float divisions = float(max.x * max.y);
	return (float(value.x * max.y + value.y) + 0.5) / divisions;
}
// unpack a float value range from 0.0 to 1.0 into a 2d vector (for small max)
ivec2 unpackFromUnit(float value, ivec2 max) {
	int index = int(value * float(max.x * max.y));
	return ivec2(index / max.y, index % max.y);
}
// check out of bound, bottomLeft inclusive, topRight exclusive
bool isOOB(ivec2 bottomLeft, ivec2 topRight, ivec2 target) {
	return any(lessThan(target, bottomLeft))
			|| any(greaterThanEqual(target, topRight));
}
#pragma endregion

#pragma region structure and constant
// the head of a running pipe
struct PipeHead {
	ivec2 position; // position by cell count from bottom left
	ivec2 direction; // bottom left negative
	int paletteIdx; // color index on the palette
};
// the maximums for packing a pipe head
ivec2 packMax = ivec2(paletteCount, 5);
// unpack pipe head from a data pixel, assume valid, alpha unused
PipeHead unpackPipeHead(vec3 dataPixel, ivec2 cellCount) {
	ivec2 bDataPair = unpackFromUnit(dataPixel.b, packMax);
	// 0 and 2 represents vertical axis, 1 and 3 represents horizontal axis
	ivec2 direction = ivec2(bDataPair.y, bDataPair.y + 1) % 2;
	// 0 and 1 point toward bottom and left, 2 and 3 point toward top and right
	if (bDataPair.y < 2) direction = -direction;
	ivec2 position = ivec2(dataPixel.rg * vec2(cellCount));
	return PipeHead(position, direction, bDataPair.x);
}
// pack pipe head into a data pixel, assume valid, alpha unused
vec3 packPipeHead(PipeHead head, ivec2 cellCount) {
	int axis = abs(head.direction.x);
	int axisSign = 1 + (head.direction.x + head.direction.y);
	float b = packToUnit(ivec2(head.paletteIdx, axis + axisSign), packMax);
	return vec3((vec2(head.position) + 0.5) / vec2(cellCount), b);
}
// the data essential for drawing and locating pixel
struct GridData {
	ivec2 areaSize; // the size in pixels of the drawable area
	int cellSize; // the size of a cell in pixel
	ivec2 cellCount; // the count of cell in each axis, edge cells may be partial
};
#pragma endregion

#pragma region plumber function
// reset out of bound pipe to a new entrance
void resetOOBPipe(inout PipeHead head, ivec2 cellCount) {
	int entryIdx = int(random() * float(cellCount.x + cellCount.y));
	// whether it is coming from the top or right edge
	bool flipEdge = random() > 0.5;
	if (entryIdx < cellCount.x) {
		head.position = ivec2(entryIdx, flipEdge ? cellCount.y : -1);
		head.direction = ivec2(0, flipEdge ? -1 : 1);
	} else {
		head.position = ivec2(flipEdge ? cellCount.x : -1, entryIdx - cellCount.x);
		head.direction = ivec2(flipEdge ? -1 : 1, 0);
	}
}
// move the pipe head and return the pipe ID for drawing
ivec2 progressPipe(inout PipeHead head, float forwardChance) {
	head.position += head.direction;
	if (random() < forwardChance) return head.direction;
	ivec2 oldDirection = head.direction;
	head.direction = head.direction.yx;
	if (random() > 0.5) head.direction = -head.direction;
	return head.direction - oldDirection;
}
#pragma endregion

#pragma region porcelain function
// move pipe to a rederable cell and return the pixel color, will use globals
vec4 progressForNextFrame(inout PipeHead head, GridData gridData) {
	// offset coordinates so that the edge cells have the same size
	ivec2 areaOffset = gridData.cellCount * gridData.cellSize - gridData.areaSize;
	ivec2 newCoord = ivec2(gl_FragCoord.xy) + areaOffset / 2;
	ivec2 pipeId = progressPipe(head, forwardChance);
	// reset out of bound pipe to the edge, and enter the frame for render
	if (isOOB(ivec2(0), gridData.cellCount, head.position)) {
		resetOOBPipe(head, gridData.cellCount);
		head.paletteIdx = int(random() * float(paletteCount));
		pipeId = progressPipe(head, forwardChance);
	}
	// no change if it is not in the new head range
	if (newCoord / gridData.cellSize != head.position) return vec4(-1.0);
	vec2 uv = vec2(newCoord % gridData.cellSize) / vec2(gridData.cellSize);
	return getPipePixel(pipeId, uv, head.paletteIdx);
}
#pragma endregion

#ifndef UNIT_TEST
void main(void) {
	// grid data
	int cellSize = int(min(resolution.x, resolution.y)) / cellsPerEdge;
	GridData gridData = GridData(
		ivec2(resolution), cellSize, ivec2(resolution / float(cellSize)) + 1
	);
	// data pixel with compressed data about states
	vec4 dataPixel = texelFetch(backbuffer, ivec2(0), 0);
	vec4 lastColor = texelFetch(backbuffer, ivec2(gl_FragCoord.xy), 0);
	// use some frames to aggregate entropy, first pixel is used for data
	if (time < 0.1) {
		seed = time + dataPixel.a;
		if (ivec2(gl_FragCoord.xy) == ivec2(0)) {
			// we don't care about the direction, randomize palette
			gl_FragColor = vec4(vec2(1.0), random(), random());
		} else {
			// offset coordinates so that the edge cells have the same size
			ivec2 areaOffset = (gridData.cellCount * gridData.cellSize
				- gridData.areaSize) / 2;
			ivec2 newCoord = ivec2(gl_FragCoord.xy) + gridData.cellSize - areaOffset;
			vec2 uv = vec2(newCoord % gridData.cellSize) / vec2(gridData.cellSize);
			gl_FragColor = getPipePixel(ivec2(0), uv, 0);
		}
		return;
	}
	// data extraction from data pixel
	seed = dataPixel.a;
	PipeHead head = unpackPipeHead(dataPixel.rgb, gridData.cellCount);
	// put it here before branching to preserve the random seed
	vec4 pixelColor = progressForNextFrame(head, gridData);
	// update the data pixel to represent the last frame or render pixel
	if (ivec2(gl_FragCoord.xy) == ivec2(0)) {
		// second frame in the valid refresh zone
		seed += time;
		gl_FragColor = vec4(packPipeHead(head, gridData.cellCount), random());
	} else gl_FragColor = pixelColor.a == -1.0 ? lastColor : pixelColor;
}

#pragma region unit test
#else
bool testUnitPacking(int size) {
	for (int i = 0; i < size - 1; i++) {
		ivec2 testcase = ivec2(i, i + 1);
		float packed = packToUnit(testcase, ivec2(size));
		if (unpackFromUnit(packed, ivec2(size)) != testcase) return false;
		testcase = ivec2(random() * float(size), random() * float(size));
		packed = packToUnit(testcase, ivec2(size));
		if (unpackFromUnit(packed, ivec2(size)) != testcase) return false;
	}
	return true;
}
bool testPipeHeadPacking(int size) {
	for (int i = 0; i < size; i++) {
		for (int j = 0; j < size; j++) {
			ivec2 direction = ivec2(
				j % 2 == 0 ? 0 : (i % 2) * 2 - 1,
				j % 2 == 1 ? 0 : (i % 2) * 2 - 1
			);
			int paletteIdx = int(random() * float(paletteCount));
			PipeHead testcase = PipeHead(ivec2(i, j), direction, paletteIdx);
			vec3 packed = packPipeHead(testcase, ivec2(size));
			if (unpackPipeHead(packed, ivec2(size)) != testcase) return false;
		}
	}
	return true;
}

void main(void) {
	vec4 lastResult = texelFetch(backbuffer, ivec2(0), 0);
	if (lastResult.r == 1.0 || lastResult.g == 1.0) {
		gl_FragColor = lastResult;
		return;
	}
	bool result = testUnitPacking(11/*2896*/) && testPipeHeadPacking(20);
	gl_FragColor = result ? vec4(0.0, 1.0, 0.0, 1.0) : vec4(1.0, 0.0, 0.0, 1.0);
}
#endif
#pragma endregion
