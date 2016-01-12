// todo: setup stones

"use strict";
var sgf = require('smartgame')
var smartgamer = require('smartgamer')
var fs = require('fs')
var util = require('util')
var go = require('gojs/board')
var assert = require('assert')
var walk = require('fs-walk');
var path = require('path');

var ad = require('automatic-differentiation-js/build/ad.js')
var util = require('util')

function parseSGFCoordChar(cc) {
  assert(cc >= 97)
  assert(cc <= 97+18)
  return cc - 97}

function parseSGFCoord(c) {
  if (c.length != 2) {
    console.log('bad coord in parseSGFCoord: "' + c + '"')
    assert(false)}
  var x = parseSGFCoordChar(c.charCodeAt(0))
  var y = 18-parseSGFCoordChar(c.charCodeAt(1))
  return new go.coord(x, y)}


function kgsgamesFromYear(year) {
  var files = []
  walk.filesSync(
    '/home/ml/kgsgames/' + year,
    function(basedir, filename, stat) {
      files.push(path.join(basedir, filename))},
    function(err) {
      if (err)
	console.log(err)})
  return files}

function sgfFiles() {
  var res = [].concat(
    kgsgamesFromYear('2015'),
    kgsgamesFromYear('2014'),
    kgsgamesFromYear('2013'),
    kgsgamesFromYear('2012'),
    kgsgamesFromYear('2011'),
    kgsgamesFromYear('2010'),
    kgsgamesFromYear('2009'),
    kgsgamesFromYear('2008'),
    kgsgamesFromYear('2007'),
    kgsgamesFromYear('2006'),
    kgsgamesFromYear('2005'),
    kgsgamesFromYear('2004'),
    kgsgamesFromYear('2003'),
    kgsgamesFromYear('2002'))
  console.log('num sgf files:', res.length)
  return res}

function randomArrayElement(ary) {
  return ary[Math.random()*ary.length|0]}


function replayGame(filename, callback, error) {
  var sgfFile = fs.readFileSync(filename, { encoding: 'utf8' })
  var content = sgf.parse(sgfFile)
  if (!content.gameTrees)
    return null
  var g = smartgamer(content)
  var last = g.last().node()
  var len = 1;
  g.goTo(1)
  while (g.node() !== last) {
    len++
    g.next()}

  if (len < 10)
    return
  var board = new go.board()
  var start = +new Date()

  g.goTo(0)
  var n0 = g.node()
  if (n0.GM != '1'
      || n0.SZ != '19'
      || n0.RU != 'Japanese'
      || n0.AW)
    return
  if (n0.AB) {
    for (var p of n0.AB)
      board.place(go.black, parseSGFCoord(p))}
  
  g.goTo(1)
  var i = 0
  for (var i = 0; i < 1000; i++) {
    var nd = g.node()
    var b = nd.B
    var w = nd.W
    var col = null
    var coord = null
    if (b) {
      col = go.black
      coord = parseSGFCoord(b)}
    else if (w) {
      col = go.white
      coord = parseSGFCoord(w)}

    if (b === '' || w === '') {
      /*console.log('pass')*/}
    else if (col === null) {
      console.log('couldnt read color', b, w, nd)
      return error && error('parse move', board, nd, col, coord)}
    else if (!board.canPlace(col, coord)) {
      console.log(util.inspect(content, 0, 7))
      console.log(filename)
      return error && error('!canPlace', board, nd, col, coord)}
    else {
      var res = callback(i, board, col, coord)
      if (!res)
	break
      board.place(col, coord)}

    if (g.node() === last)
      break
    g.next()
    i++
  }
  // console.log(board.toString())
  var took = +new Date() - start
  // console.log('game replay took', took)
}


var gamefiles = null
function extractSomePatches(n, pred, prob, extract) {
  if (gamefiles === null)
    gamefiles = sgfFiles()
  var patches = []
  while (1) {
    var filename = randomArrayElement(gamefiles)
    // console.log(filename)
    try {
      replayGame(
	filename,
	function (i, board, col, coord) {
	  if (pred(i, col, coord)
	      && Math.random() < prob) {
	    var patch = extract(board, col, coord)
	    if (patch) {
	      // console.log(board.toString())
	      // console.log(patches.length,
	      //	  'extract patch', i, col, coord.toString())
	      // console.log(patch.toString())
	      patches.push(patch)
	      if (patches.length >= n)
		return false}}
	  return true},
	function (msg, board, nd, col, coord) {
	  console.log('error', msg, 'col', col,
		      'at', coord && coord.toString())
	  // console.log(board.toString())
	})
    } catch (e) {
      console.log(e)
      console.log(e.stack)
      console.trace('couldnt replay', filename)}
    if (patches.length >= n)
      break}
  return patches}

function distanceToBorder(coord) {
  var x = coord.x()
  var y = coord.y()
  return Math.min(Math.min(x, 18-x),
		  Math.min(y, 18-y))}

function distanceToCorner(coord) {
  var x = coord.x()
  var y = coord.y()
  return Math.max(Math.min(x, 18-x),
		  Math.min(y, 18-y))}

function randint(n) {
  return Math.floor(Math.random()*n)}

function normalizeRectangleBase(co, width, height) {
  var x = co.x()
  var y = co.y()
  x = Math.min(x, 18-x-width+1)
  y = Math.min(y, 18-y-height+1)
  if (y > x) {
    var t = x
    x = y
    y = t}
  return new go.coord(x, y)}

function extractPatch(width, height, board, col, coord, baseCoord) {

  var cx = coord.x()
  var cy = coord.y()

  // px/py is the lower left corner of the patch.
  // any spots that coincide with baseCoord after normalisation are good
  var minx = Math.max(0, cx-width+1)
  var maxx = Math.min(18-width+1, cx)
  var miny = Math.max(0, cy-height+1)
  var maxy = Math.min(18-height+1, cy)

  var options = []
  for (var mx = minx; mx <= maxx; mx++)
    for (var my = miny; my <= maxy; my++) {
      var q = new go.coord(mx, my)
      var n = normalizeRectangleBase(q, width, height)
      if (baseCoord.equals(n))
	options.push(q)}
  var pl = randomArrayElement(options)

  return extractPatchAt(width, height, board, col, coord, pl)}

function extractPatchAt(width, height, board, col, coord, pl) {
  var px = pl.x()
  var py = pl.y()
  var lines = []
  for (var yi = 0; yi < height; yi++) {
    var y = py + yi
    var line = []
    for (var xi = 0; xi < width; xi++) {
      var x = px + xi
      var co = new go.coord(x, y)
      var st = board.fieldAt(co)
      if (col == go.white && (st == go.black || st == go.white))
	st = go.otherColor(st)
      var libs = 0
      if (st !== go.empty)
	libs = board.numLibsAt(co)
      line.push({col: st,
		 libs: libs,
		 next: coord && co.equals(coord) ? true : false})}
    lines.push(line)}
  return new patch(new go.coord(px, py), lines)}

class patch {
  constructor(coord, lines) {
    this.coord = coord
    this.lines = lines}
  numStones() {
    var count = 0
    for (var line of this.lines)
      for (var l of line)
	if (l.col === go.black || l.col === go.white)
	  count++
    return count}
  flipVertically() {
    var width = this.lines[0].length
    var co = new go.coord(18-this.coord.x()-width+1, this.coord.y())
    var ls = []
    for (var l of this.lines) {
      var a = Array.from(l)
      a.reverse()
      ls.push(a)}
    return new patch(co, ls)}
  flipHorizontally() {
    var height = this.lines.length
    var co = new go.coord(this.coord.x(), 18-this.coord.y()-height+1)
    var ls = Array.from(this.lines)
    ls.reverse()
    return new patch(co, ls)}
  swapAxes() {
    var co = new go.coord(this.coord.y(), this.coord.x())
    var ls = []
    for (var i = 0; i < this.lines[0].length; i++) {
      ls[i] = []
      for (var j = 0; j < this.lines.length; j++)
	ls[i].push(this.lines[j][i])}
    return new patch(co, ls)}
  toString() {
    var c = this.coord;
    var ts = ['patch from ', c.toString(), '\n']
    var lr = Array.from(this.lines)
    lr.reverse()
    for (var line of lr) {
      ts.push(' :')
      for (var p of line) {
	ts.push(' ')
	ts.push(p===null ? '~'
		: p.next ? '*'
		: p.col === go.black ? '○'
		: p.col === go.white ? '●'
		: p.col === go.empty ? '.'
		: '?')}
      ts.push(' :\n')}
    return ts.join('')}
  cloneWithNoise(p) {
    var lines = []
    for (var line of this.lines) {
      var li = []
      for (var l of line) {
	if (Math.random() > p)
	  li.push(l)
	else
	  li.push(null)}
      lines.push(li)}
    return new patch(this.coord, lines)}
  cloneWithNoNext(p) {
    var lines = []
    for (var line of this.lines) {
      var li = []
      for (var l of line) {
	li.push({col: l.col,
		 libs: l.libs,
		 next: null})}
      lines.push(li)}
    return new patch(this.coord, lines)}
}

function normalizePatch(p, width, height) {
  // also see normalizeRectangleBase()
  
  var x = p.coord.x()
  var y = p.coord.y()

  var ox = 18-x-width+1
  if (ox < x) {
    p = p.flipVertically()
    x = ox}

  var oy = 18-y-height+1
  if (oy < y) {
    p = p.flipHorizontally()
    y = oy}
  
  if (y > x)
    p = p.swapAxes()
  return p}


function arrayShuffle(ary) {
  for (var i = 0; i < ary.length; i++) {
    var r = Math.floor(Math.random()*ary.length);
    var t = ary[i]
    ary[i] = ary[r]
    ary[r] = t}}

function batchedPatches(range, pw, ph, batchsize, p) {
  p = p | 0.3
  var sh = 43
  var patches = extractSomePatches(
    sh*batchsize,
    (i, col, coord) => range.liesWithin(coord),
    0.3,
    function (board, col, coord) {
      var p = extractPatch(pw, ph, board, col, coord, range.base)
      if (p && p.numStones() >= 4)
	return normalizePatch(p, pw, ph)
      else
	return null})
  arrayShuffle(patches)
  var batches = []
  while (patches.length > 0) {
    assert(patches.length >= batchsize)
    batches.push(new goBatch(patches.slice(0, batchsize)))
    patches = patches.slice(batchsize)}
  return batches}

  

function encodePatch(patch) {
  var bits = []
  function add(x) {
    bits.push(x ? 1.0 : 0.0)}
  var lines = patch.lines
  var lsl = lines.length
  for (var i = 0; i < lsl; i++) {
    var line = lines[i]
    var ll = line.length
    for (var j = 0; j < ll; j++) {
      var o = line[j]
      var border = i === 0 || j === 0 || i === lsl-1 || j === ll-1
      var b = o && o.col === go.black
      var w = o && o.col === go.white
      add(b)
      add(w)
      add(o && o.col === go.empty)
      add(o && o.next === true)
      add(o && o.next === false)
      if (border) {
	add(b && o.libs === 1)
	add(b && o.libs === 2)
	add(b && o.libs === 3)
	add(b && o.libs >= 4)
	add(w && o.libs === 1)
	add(w && o.libs === 2)
	add(w && o.libs === 3)
	add(w && o.libs >= 4)}}}
  return bits}

function decodeDataPlayDontPlay(patch, dat) {
  var res = []
  var ptr = 0
  function get(x) {
    return dat[ptr++]}
  var xb = patch.coord.x()
  var yb = patch.coord.y()
  var lsl = patch.lines.length
  var ll = patch.lines[0].length
  for (var i = 0; i < lsl; i++) {
    for (var j = 0; j < ll; j++) {
      var border = i === 0 || j === 0 || i === lsl-1 || j === ll-1
      get() // b
      get() // w
      get() // empty
      var doPlay = get()
      var dontPlay = get()
      if (border) {
	get();get();get();get(); // 1,2,3,>=4 libs b
	get();get();get();get(); // 1,2,3,>=4 libs w
      }
      res.push({coord: new go.coord(xb+j, yb+i),
		doPlay: doPlay,
		dontPlay: dontPlay})
    }}
  assert.equal(dat.length, ptr)
  return res}



class abstractLayer {
  numOutputs() { throw 'abstract'}
  layerAbove() { throw 'abstract'}
  setLayerAbove() { throw 'abstract'}
}

class middleLayer extends abstractLayer {
  layerBelow() { throw 'abstract'}
  setLayerBelow() { throw 'abstract'}
  numInputs() {
    return this.layerBelow().numOutputs()}
}  

class stdLayer extends middleLayer {
  constructor() {
    super()
    this._layerAbove = null
    this._layerBelow = null}
  layerAbove() { return this._layerAbove }
  setLayerAbove(l) {
    this._layerAbove = l
    l.setLayerBelow(this)}
  layerBelow() { return this._layerBelow }
  setLayerBelow(l) {
    this._layerBelow = l}
}

class inputLayer extends abstractLayer {
  constructor(dataSize) {
    super()
    this.dataSize = dataSize}
  layerAbove() { return this._layerAbove}
  setLayerAbove(l) {
    this._layerAbove = l
    l.setLayerBelow(this)}
  numOutputs() {
    return this.dataSize}
}

class autoencoderLayer extends stdLayer {
  constructor(t, layerdef) {
    super()
    this.t = t
    this.numFilters = layerdef.numFilters
    this.numBatches = layerdef.numBatches
    this.numProcessedBatches = 0
    this.mapper = null}
  numOutputs() {
    return this.numFilters}
  isTrainingFinished() {
    return (this.numBatches
	    && this.numProcessedBatches > this.numBatches)}
  finish() {
    var t = this.t
    var numInputs = this.numInputs()
    this.filters = t.tensor('filters', [this.numFilters, numInputs])
    this.biasa = t.tensor('biasa', [this.numFilters])
    this.biasb = t.tensor('biasb', [numInputs])
    if (!this.filtersT) {
      var filtersShape = [this.numFilters, numInputs]
      this.filtersT = ad.randomTensor(filtersShape, 0.03)}
    if (!this.biasaT)
      this.biasaT = ad.randomTensor([this.numFilters], 0.01)
    if (!this.biasbT)
      this.biasbT = ad.randomTensor([numInputs], 0.01)}

  numParameters() {
    return (ad.shapeNumElements(this.filters.shape())
	    + ad.shapeNumElements(this.biasa.shape())
	    + ad.shapeNumElements(this.biasb.shape()))}

  calcHiddens(minibatchSize, input) {
    var t = this.t
    var act = t.add(
      t.einsum('ac,bc->ab', input, this.filters),
      t.einsum('b,ab->ab', this.biasa,
	       t.ones([minibatchSize, this.numFilters])))
    return t.sigmoid(act)}
  calcRecons(minibatchSize, hiddens) {
    var t = this.t
    var reconsAct = t.add(
      t.einsum('ac,cb->ab', hiddens, this.filters),
      t.einsum('b,ab->ab',
	       this.biasb,
	       t.ones([minibatchSize, this.numInputs()])))
    return t.sigmoid(reconsAct)}
  calcReconstructionError(origInput, recons) {
    var t = this.t
    return t.squaredSum(t.sub(origInput, recons))}

  compileErrorFunction(minibatchSize) {
    if (!this.compiledErrorFunction) {
      var ni = this.numInputs()
      var t = this.t
      this.noisedInput = t.tensor('noisedInput', [minibatchSize, ni])
      this.origInput = t.tensor('origInput', [minibatchSize, ni])
      this.hiddens = this.calcHiddens(minibatchSize, this.noisedInput)
      this.recons = this.calcRecons(minibatchSize, this.hiddens)
      this.err = this.calcReconstructionError(this.origInput,
					      this.recons)
      console.log(util.inspect(this.err, 0, 10))
      var comp = new ad.asmjsCompiler(this.t)
      this.compiledErrorFunction =
	comp.compile(this.err, this.neededDerivatives())}
    return this.compiledErrorFunction}

  learningDone() {
    this.noisedInput = null
    this.origInput = null
    this.hiddens = null
    this.recons = null
    this.err = null
    this.compiledErrorFunction = null}

  bindParameters(func) {
    func.bind(this.filters, this.filtersT)
    func.bind(this.biasa, this.biasaT)
    func.bind(this.biasb, this.biasbT)}

  neededDerivatives() {
    // only called when layer is in learning mode, i.e. topmost
    return [this.filters, this.biasa, this.biasb]}

  applyUpdates(learnRate, batchSize, err, gradients) {
    var gradFilters = gradients[0]
    var gradBiasa = gradients[1]
    var gradBiasb = gradients[2]
    var learnRate = 0.01
    function subtract(a,b) {
      return a-learnRate*b}
    function learn(params, grad) {
      return ad.zipTensor(params, grad, subtract)}

    this.filtersT = learn(this.filtersT, gradFilters)
    this.biasaT = learn(this.biasaT, gradBiasa)
    this.biasbT = learn(this.biasbT, gradBiasb)
    this.numProcessedBatches++}

  mapBatch(batch) {
    if (!this.mapper) {
      var minibatchSize = batch.length
      var inputShape = [minibatchSize, this.numInputs()]
      this.mapperInput = this.t.tensor('input', inputShape)
      this.mapperHid =
	this.calcHiddens(minibatchSize, this.mapperInput)
      var comp = new ad.asmjsCompiler(this.t)
      this.mapper = comp.compile(this.mapperHid, [])}
    var m = this.mapper
    m.bind(this.filters, this.filtersT)
    m.bind(this.biasa, this.biasaT)
    m.bind(this.mapperInput, batch)
    m.call()
    return m.valueForId(this.mapperHid.id)}

  mapBatchBack(batch) {
    if (!this.backMapper) {
      var minibatchSize = batch.length
      var outputShape = [minibatchSize, this.numOutputs()]
      this.backMapperOutput = this.t.tensor('output', outputShape)
      this.backMapperInput =
	this.calcRecons(minibatchSize, this.backMapperOutput)
      var comp = new ad.asmjsCompiler(this.t)
      this.backMapper = comp.compile(this.backMapperInput, [])}
    var m = this.backMapper
    m.bind(this.filters, this.filtersT)
    m.bind(this.biasb, this.biasbT)
    m.bind(this.backMapperOutput, batch)
    m.call()
    return m.valueForId(this.backMapperInput.id)}

  parametersForSaving() {
    return {type: 'autoencoderLayer',
	    numProcessedBatches: this.numProcessedBatches,
	    numInputs: this.numInputs(),
	    numOutputs: this.numOutputs(),
	    filters: this.filtersT,
	    biasa: this.biasaT,
	    biasb: this.biasbT}}
  
  static reconstructFromJson(t, l) {
    var layerdef = {numFilters: l.numOutputs,
		    numBatches: null}
    var ae = new autoencoderLayer(t, layerdef)
    ae.filtersT = l.filters
    ae.biasaT = l.biasa
    ae.biasbT = l.biasbT
    return ae}

}

function round(d, x) {
  var f = Math.pow(10, d)
  return Math.round(x * f) / f}

function withTiming(start, end, obj) {
  obj.spent = end - start
  return obj}

class stackedAutoencoders {
  constructor(t, inputLayer, layerdefs) {
    layerdefs && console.log('layerdefs', layerdefs)
    this.t = t
    this.inputLayer = inputLayer
    this.layerdefs = layerdefs
    this.current = 0
    this.layers = []
  }
  isTrainingForCurrentLayerFinished() {
    return this.layers[this.current].isTrainingFinished()}

  learnCurrentLayer(minibatchSize) {
    assert(this.current < this.layerdefs.length)
    var layerdef = this.layerdefs[this.current]
    console.log('\n\n\nlearning layer', this.current, layerdef)

    var ae = new autoencoderLayer(this.t, layerdef)
    
    this.layers[this.current] = ae
    if (this.current == 0)
      this.inputLayer.setLayerAbove(ae)
    else
      this.layers[this.current-1].setLayerAbove(ae)
    ae.finish()
    ae.compileErrorFunction(minibatchSize)
    console.log('num parameters:', ae.numParameters())}

  nextLayer() {
    this.layers[this.current].learningDone()
    this.current++
    return this.current < this.layerdefs.length}

  mapBatchThroughLayers(batch, last) {
    var dat = batch.encodeOrig()
    for (var i = 0; i < last; i++)
      dat = this.layers[i].mapBatch(dat)
    return dat}
  
  mapBatchBackThroughLayers(dat, last) {
    for (var i = last; i >= 0; i--)
      dat = this.layers[i].mapBatchBack(dat)
    return dat}
  
  learnBatch(batch, learnRate, noiseLevel) {
    var ae = this.layers[this.current]
    var origInputT = null
    var noisedInputT = null
    if (this.current === 0) {
      // todo: push encoding into input layer
      origInputT = batch.encodeOrig()
      noisedInputT = batch.encodeWithNoise(noiseLevel)}
    else {
      var dat = this.mapBatchThroughLayers(batch, this.current)
      origInputT = dat
      noisedInputT = applyNoiseToEncodedBatch(dat, noiseLevel)}
    var start = +new Date()
    var f = ae.compileErrorFunction()
    f.bind(ae.noisedInput, noisedInputT)
    f.bind(ae.origInput, origInputT)
    ae.bindParameters(f)
    f.call()
    ae.applyUpdates(
      learnRate,
      batch.batchSize(),
      f.valueForId(ae.err.id),
      ae.neededDerivatives().map(v => f.adjointForId(v.id)))

    var end = +new Date()
    var res = this.reportErrors(ae, f, batch)
    withTiming(start, end, res)
    res.numProcessedBatches = ae.numProcessedBatches
    return res}

  
  testReconsBatch(batch) {
    var ae = this.layers[this.current]
    var origInputT = this.mapBatchThroughLayers(batch, this.current)
    var start = +new Date()
    var f = ae.compileErrorFunction()
    f.bind(ae.origInput, origInputT)
    f.bind(ae.noisedInput, origInputT)
    ae.bindParameters(f)
    f.call()
    var end = +new Date()
    return withTiming(start, end, this.reportErrors(ae, f, batch))}

  reportErrors(ae, f, batch) {
    var batchSize = batch.batchSize()
    var err = f.valueForId(ae.err.id)
    var errp = round(3, Math.sqrt(err / ae.numInputs() / batchSize))
    return {err: err, errp: errp}}
  
  testPredictionBatch(batch, reallyPredict) {
    var ae = this.layers[this.current]
    var origInputT = batch.encodeOrig()
    var predInputT = null
    var start = +new Date()
    if (this.current === 0) {
      predInputT = reallyPredict ? batch.encodePred() : origInputT
      var f = ae.compileErrorFunction()
      f.bind(ae.noisedInput, predInputT)
      f.bind(ae.origInput, origInputT)
      ae.bindParameters(f)
      f.call()
      return {err: f.valueForId(ae.err.id),
	      recons: f.valueForId(ae.recons.id)}}
    else {
      var nnbatch = reallyPredict ? batch.cloneBatchWithNoNext() : batch
      var hidT = this.mapBatchThroughLayers(nnbatch, this.current+1)
      var recons = this.mapBatchBackThroughLayers(hidT, this.current)
      var err = squaredDiff(origInputT, recons)
      return {err: err,
	      recons: recons}}}

  saveParameters() {
    var filename = 'sa-' + +new Date() + '.par'
    var params = this.layers.map(l => l.parametersForSaving())
    fs.writeFileSync(filename, JSON.stringify(params))
    console.log('wrote parameters to', filename)}

  static reconstructFromJson(dat) {
    var t = new ad.T()
    var layers = dat.map(
      l => autoencoderLayer.reconstructFromJson(t, l))
    var inp = new inputLayer(dat[0].numInputs)
    var l = inp
    for (var i = 0; i < layers.length; i++) {
      l.setLayerAbove(layers[i])
      l = layers[i]}
    for (var layer of layers)
      layer.finish()
    var layerdefs = null
    var sa = new stackedAutoencoders(t, inputLayer, layerdefs)
    sa.layers = layers
    sa.current = layers.length-1
    return sa}
}


function squaredDiff(a, b) {
  // aww, zip for side effect...
  var sum = 0
  ad.zipTensor(a, b, function (a,b) {
    sum += Math.pow(a-b, 2)
    return 0})
  return sum}


class goBatch {
  constructor(patches) {
    this.patches = patches}
  batchSize() {
    return this.patches.length}
  encodeOrig() {
    return this.patches.map(encodePatch)}
  cloneBatchWithNoNext() {
    return new goBatch(this.patches.map(p => p.cloneWithNoNext()))}
  encodePred() {
    return (this.patches
	    .map(p => encodePatch(p.cloneWithNoNext())))}
  encodeWithNoise(noiseLevel) {
    return (this.patches
	    .map(p => encodePatch(p.cloneWithNoise(noiseLevel))))}}

function applyNoiseToEncodedBatch(batch, noiseLevel) {
  function an(dat) {
    return dat.map(d => {
      if (Math.random() > noiseLevel)
	return d
      else
	return 0})}
  return batch.map(an)}


function reportPrediction(batch, recons) {
  var numExamples = Math.min(10, batch.batchSize())
  for (var b = 0; b < numExamples; b++) {
    var patch = batch.patches[b]
    var re = decodeDataPlayDontPlay(patch, recons[b])
    console.log(patch.toString())
    re.sort(function (a,b) {return b.doPlay - a.doPlay})
    var output = []
    for (var i = 0; i < 5; i++) {
      var r = re[i]
      output.push(r.coord.toString()
		  + ' '
		  + round(3, r.doPlay))}
    console.log(output.join('  ') + '\n')}}


class coordRange {
  // range is square
  // size is towards center
  constructor(base, size) {
    this.base = this.normalize(base)
    this.size = size}
  liesWithin(co) {
    co = this.normalize(co)
    var x = co.x()
    var y = co.y()
    var bx = this.base.x()
    var by = this.base.y()
    var res = (x >= bx
	       && y >= by
	       && x < bx+this.size
	       && y < by+this.size)
    // console.log('check if', co.toString(), 'is in range:', res)
    return res}
  normalize(co) {
    var x = co.x()
    var y = co.y()
    if (x > 9)
      x = 18-x
    if (y > 9)
      y = 18-y
    if (y > x) {
      var t = y
      y = x
      x = t}
    return new go.coord(x, y)}
}


function learn(args, layerdefs) {
  var patternSize = args.patternSize
  var noiseLevel = args.noiseLevel
  var minibatchSize = args.minibatchSize
  var learnRate = args.learnRate
  
  var dataSize = ((patternSize-2)*(patternSize-2)*5
		  + (2*patternSize-2)*2*13)

  var t = new ad.T()
  var input = new inputLayer(dataSize)
  var sa = new stackedAutoencoders(t, input, layerdefs)
  var range = new coordRange(args.baseCoord, patternSize)

  while (true) {
    console.log('starting layer', new Date().toString())
    sa.learnCurrentLayer(minibatchSize)

    var count = 0
    var t = 1
    var batches = []
    while (1) {
      if (batches.length == 0)
	batches = batchedPatches(range, patternSize, patternSize,
				 minibatchSize)
      var batch = batches.pop()
      count++
      var modCount = count % 100
      if (modCount < 100-3*t) {
	var res = sa.learnBatch(batch, learnRate, noiseLevel)
	console.log('' + res.numProcessedBatches
		    + '\terr ' + round(0, res.err)
		    + ' ' + round(3, res.errp)
		    + '\t' + res.spent + 'ms')}
      else {
	var reconsLocal = modCount == 97
	if (reconsLocal) {
	  var res = sa.testReconsBatch(batch)
	  console.log('lrec\terr ' + round(0, res.err)
		      + ' ' + round(3, res.errp)
		      + '\t' + res.spent + 'ms')}
	else {
	  var globalRecons = modCount == 98
	  if (globalRecons) {
	    var res = sa.testPredictionBatch(batch, false)
	    console.log('grec\terr', res.err)}
	  else {
	    var res = sa.testPredictionBatch(batch, true)
	    console.log('test prediction err', res.err)
	    reportPrediction(batch, res.recons)
	    if (sa.isTrainingForCurrentLayerFinished())
	      break}}}}

    console.log('finished layer', new Date().toString())
    var c = sa.nextLayer()
    if (!c)
      break}

  sa.saveParameters()
}

function parseArguments() {
  var args = process.argv.slice(2)
  var res = {patternSize: 5,
	     noiseLevel: 0.1,
	     learnRate: 0.01,
	     minibatchSize: 100,
	     numBatches: 6000,
	     numLayers: 3,
	     numFilters: 200}
  while (args.length > 0) {
    var a = args[0]
    if (a == '--base-coord') {
      res.baseCoord = go.coord.fromName(args[1])
      args = args.slice(2)}
    else if (a == '--noise-level') {
      res.noiseLevel = parseFloat(args[1])
      args = args.slice(2)}
    else if (a == '--learn-rate') {
      res.learnRate = parseFloat(args[1])
      args = args.slice(2)}
    else if (a == '--pattern-size') {
      res.patternSize = parseInt(args[1])
      args = args.slice(2)}
    else if (a == '--minibatch-size') {
      res.minibatchSize = parseInt(args[1])
      args = args.slice(2)}
    else if (a == '--num-filters') {
      res.numFilters = parseInt(args[1])
      args = args.slice(2)}
    else if (a == '--num-layers') {
      res.numLayers = parseInt(args[1])
      args = args.slice(2)}
    else if (a == '--num-batches') {
      res.numBatches = parseInt(args[1])
      args = args.slice(2)}}
  console.log('final arguments:')
  console.log(util.inspect(res, 0, 10))
  return res}

function runLearn() {
  var args = parseArguments()
  var layerdefs = []
  for (var i = 0; i < args.numLayers; i++)
    layerdefs.push({numFilters: args.numFilters,
		    numBatches: args.numBatches})
  learn(args, layerdefs)}

function readJsonFile(filename) {
  return JSON.parse(
    fs.readFileSync(filename, {encoding: 'utf8'}))}
  

class autoencoders {
  constructor(listfile) {
    this.dirname = path.dirname(listfile)
    this.autoencoders =
      readJsonFile(listfile)
      .map(e => ({base: go.coord.fromName(e.base),
		  file: e.file}))
    this.loaded = new Map()}
  atBase(co) {
    var index = co.index()
    var ae = this.loaded.get(index)
    if (!ae) {
      ae = this.loadAutoencoder(co)
      this.loaded.set(index, ae)}
    return ae}
  loadAutoencoder(co) {
    for (var def of this.autoencoders) {
      if (def.base.equals(co))
	return this.loadAutoencoderFromFile(def)}
    throw 'no such autoencoder'}
  loadAutoencoderFromFile(def) {
    var ae = readJsonFile(path.join(this.dirname, def.file))
    return stackedAutoencoders.reconstructFromJson(ae)}
}

function buildPartialPatch(width, height, knowns) {
  var lines = []
  for (var yi = 0; yi < height; yi++) {
    var line = []
    for (var xi = 0; xi < width; xi++)
      line.push(null)
    lines.push(line)}
  for (var k of knowns)
    lines[k.y][k.x] = {col: k.col,
		       libs: null,
		       next: null}
  return new patch(new go.coord(0, 0), lines)}

function arrayReversed(ary) {
  var res = Array.from(ary)
  res.reverse()
  return res}

function decodeDataBlackWhiteEmpty(patch, dat) {
  var res = []
  var ptr = 0
  function get(x) {
    return dat[ptr++]}
  var xb = patch.coord.x()
  var yb = patch.coord.y()
  var lsl = patch.lines.length
  var ll = patch.lines[0].length
  for (var i = 0; i < lsl; i++) {
    for (var j = 0; j < ll; j++) {
      var border = i === 0 || j === 0 || i === lsl-1 || j === ll-1
      var b = get() // b
      var w = get() // w
      var e = get() // empty
      get() // play
      get() // dont play
      if (border) {
	get();get();get();get(); // 1,2,3,>=4 libs b
	get();get();get();get(); // 1,2,3,>=4 libs w
      }
      res.push({coord: new go.coord(xb+j, yb+i),
		b: b,
		w: w,
		e: e})
    }}
  assert.equal(dat.length, ptr)
  return res}

function batchBernoulliSample(batch) {
  return batch.map(bernoulliSample)}

function bernoulliSample(dat) {
  return dat.map(sample)}

function sample(p) {
  return p > Math.random() ? 1.0 : 0.0}
  
function someSamplePatches(base, pw, ph, f) {
  replayGame(
    // '../kgsgames/2015/9/22/sum-muslinca.sgf'
    '../kgsgames/2015/3/9/twoeye-MrBaduk.sgf'
    ,
    function (i, board, col, coord) {
      if (distanceToCorner(coord) <= 4 && Math.random() < 0.99) {
	var p = extractPatch(pw, ph, board, col, coord, base)
	if (p && p.numStones() >= 4)
	  f(normalizePatch(p, pw, ph))}
      return true})}

  ////// var knowns = [
  //////   // {x: 2, y: 2, col: go.black}
  //////   {x: 2, y: 2, col: go.black},
  //////   {x: 3, y: 2, col: go.black}
  ////// ]
  ////// var p = buildPartialPatch(5, 5, knowns)
  ////// console.log(p.toString())
  ////// var batch = new goBatch([p])

function sample() {
  var as = new autoencoders('ae-5-nl4/list.js')
  // console.log(util.inspect(as, 0, 4))
  var base = new go.coord(0,0)
  var A1ae = as.atBase(base)

  var pw = 5
  var ph = 5
  someSamplePatches(
    base, pw, ph,
    function (patch) {
      console.log(patch.toString())
      var batch = new goBatch([patch])
      var dat = batch.encodeOrig()
      for (var l of A1ae.layers)
	dat = l.mapBatch(dat)
      for (var l of arrayReversed(A1ae.layers)) {
	// dat = batchBernoulliSample(dat)
	dat = l.mapBatchBack(dat)
      }

      var nboard = new go.board()
      var decoded = decodeDataBlackWhiteEmpty(patch, dat[0])
      for (var d of decoded) {
	var sum = d.b + d.w + d.e
	var b = d.b / sum
	var w = d.w / sum
	var bw = b+w
	var r = Math.random()
	if (r < bw) {
	  var col = go.white
	  if (r < b)
	    col = go.black
	  nboard.place(col, d.coord)}}
      var np = extractPatchAt(pw, ph, nboard, go.black, null, base)
      console.log(np.toString())
      console.log('\n\n')
    })
}

// runLearn()
sample()
