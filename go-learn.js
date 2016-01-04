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
  assert(c.length === 2)
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
    kgsgamesFromYear('2013'),
    kgsgamesFromYear('2012'),
    kgsgamesFromYear('2011'),
    kgsgamesFromYear('2010'),
    kgsgamesFromYear('2009'))
  console.log('num sgf files:', res.length)
  return res}

function randomArrayElement(ary) {
  return ary[Math.random()*ary.length|0]}


function replayGame(filename, callback, error) {
  var example = fs.readFileSync(filename, { encoding: 'utf8' })
  var content = sgf.parse(example)
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
  if (n0.SZ != '19')
    return
  if (n0.GM != '1')
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
      return error('parse move', board, nd, col, coord)}
    else if (!board.canPlace(col, coord)) {
      console.log(util.inspect(content, 0, 7))
      console.log(filename)
      return error('!canPlace', board, nd, col, coord)}
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
    replayGame(
      filename,
      function (i, board, col, coord) {
	if (pred(i, col, coord)
	    && Math.random() < prob) {
	  var patch = extract(board, col, coord)
	  if (patch) {
	    // console.log('extract patch', i, col, coord.toString())
	    // console.log(board.toString())
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

function randintFromTo(a, b) {
  var len = b - a + 1
  return a + randint(len)}

function extractPatch(width, height, board, col, coord, place) {
  var cx = coord.x()
  var cy = coord.y()
  // px/py is the lower left corner of the patch
  var minx = Math.max(0, cx-width+1)
  var maxx = Math.min(18-width, cx)
  var miny = Math.max(0, cy-height+1)
  var maxy = Math.min(18-height, cy)
  var pl = place(minx, maxx, miny, maxy)
  if (!pl) return null
  var px = pl[0]
  var py = pl[1]

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
		 next: coord.equals(co) ? true : false})}
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

function normalizePatch(p) {
  if (p.coord.x() > 9)
    p = p.flipVertically()
  if (p.coord.y() > 9)
    p = p.flipHorizontally()
  if (p.coord.y() > p.coord.x())
    p = p.swapAxes()
  return p}

function placeInCorner(patternWidth,
		       patternHeight,
		       maxDistanceToCorner)
{
  var ri = 18 - patternWidth + 1
  var to = 18 - patternHeight + 1
  return function (minx, maxx, miny, maxy) {
    for (var i = 0; i < 20; i++) {
      var px = randintFromTo(minx, maxx)
      if (minx == 0 && Math.random() < 0.9) px = 0
      if (maxx == ri && Math.random() < 0.9) px = ri
      var py = randintFromTo(miny, maxy)
      if (miny == 0 && Math.random() < 0.9) py = 0
      if (maxy == to && Math.random() < 0.9) py = to
      
      var cx = px
      if (cx > 9)
	cx += patternWidth-1
      var cy = py
      if (cy > 9)
	cy += patternHeight-1
      
      var co = new go.coord(cx, cy)
      if (distanceToCorner(co) <= maxDistanceToCorner)
	return [px, py]}
    return null}}

function arrayShuffle(ary) {
  for (var i = 0; i < ary.length; i++) {
    var r = Math.floor(Math.random()*ary.length);
    var t = ary[i]
    ary[i] = ary[r]
    ary[r] = t}}

function batchedPatchesPerPlace(pw, ph, batchsize, callback) {
  var pl = new Map()
  while (1) {
    var patches =
      extractSomePatches(
	1000,
	(i, col, coord) => distanceToCorner(coord) <= 5,
	0.4,
	function (board, col, coord) {
	  var p = extractPatch(pw, ph, board, col, coord,
			       placeInCorner(pw, ph, 1))
	  if (p && p.numStones() >= 4)
	    return normalizePatch(p)
	  else
	    return null})
    for (var p of patches) {
      var idx = p.coord.index()
      var l = null
      if (pl.has(idx))
	l = pl.get(idx)
      else {
	l = []
	pl.set(idx, l)}
      l.push(p)}
    var npl = new Map()
    for (var idx of pl.keys()) {
      var patches = pl.get(idx)
      if (patches.length >= 2*batchsize) {
	arrayShuffle(patches)
	while (patches.length >= batchsize) {
	  var take = patches.slice(0, batchsize)
	  patches = patches.slice(batchsize)
	  var co = go.coord.fromIndex(idx)
	  if (!callback(co, take))
	    return 'done'}}
      npl.set(idx, patches)}
    pl = npl}}

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

function decodeData(patch, dat) {
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


function prepareMinibatches(pw, ph, minibatchSize, callback) {
  batchedPatchesPerPlace(
    pw, ph, minibatchSize,
    function (coord, patches) {
      var batch = new goBatch(coord, patches)
      return callback(batch)})}


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
    this.numProcessedBatches = 0}
  numOutputs() {
    return this.numFilters}
  finish() {
    var t = this.t
    var numInputs = this.numInputs()
    this.filters = t.tensor('filters', [this.numFilters, numInputs])
    this.biasa = t.tensor('biasa', [this.numFilters])
    this.biasb = t.tensor('biasb', [numInputs])
    this.filtersT = ad.randomTensor([this.numFilters, numInputs], 0.03)
    this.biasaT = ad.randomTensor([this.numFilters], 0.01)
    this.biasbT = ad.randomTensor([numInputs], 0.01)}
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

    var errp = round(3, Math.sqrt(err / this.numInputs() / batchSize))
    console.log(this.numProcessedBatches , 'err', round(2, err), errp)
    this.numProcessedBatches++
    ////// , spent,
    ////// nonoise ? 'nonoise'
    //////   : test ? 'test' : '')
  }
}

function round(d, x) {
  var f = Math.pow(10, d)
  return Math.round(x * f) / f}

class stackedAutoencoders {
  constructor(t, inputLayer, layerdefs) {
    console.log('layerdefs', layerdefs)
    this.t = t
    this.inputLayer = inputLayer
    this.layerdefs = layerdefs
    this.current = 0
    this.layers = []
  }
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
    ae.compileErrorFunction(minibatchSize)}

  nextLayer() {
    this.layers[this.current].learningDone()
    this.current++
    return this.current < this.layerdefs.length}
  
  learnBatch(batch, learnRate, noiseLevel) {
    var ae = this.layers[this.current]
    var origInputT = null
    var noisedInputT = null
    if (this.current === 0) {
      origInputT = batch.encodeOrig()
      noisedInputT = batch.encodeWithNoise(noiseLevel)}
    else {
      // todo: map batch with non-current encoders
      // todo: apply noise
      throw 'todo'}
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
  }
  testReconsBatch(batch) {
    var ae = this.layers[this.current]
    var origInputT = null
    if (this.current === 0)
      origInputT = batch.encodeOrig()
    else {
      // todo: map batch with non-current encoders
      // todo: apply noise
      throw 'todo'}
    var start = +new Date()
    var f = ae.compileErrorFunction()
    f.bind(ae.origInput, origInputT)
    f.bind(ae.noisedInput, origInputT)
    ae.bindParameters(f)
    f.call()
    return f.valueForId(ae.err.id)}
  
  testPredictionBatch(batch) {
    var ae = this.layers[this.current]
    var origInputT = null
    var predInputT = null
    if (this.current === 0) {
      origInputT = batch.encodeOrig()
      predInputT = batch.encodePred()}
    else {
      // todo: map batch with non-current encoders
      // todo: apply noise
      throw 'todo'}
    var start = +new Date()
    var f = ae.compileErrorFunction()
    f.bind(ae.noisedInput, predInputT)
    f.bind(ae.origInput, origInputT)
    ae.bindParameters(f)
    f.call()
    return {err: f.valueForId(ae.err.id),
	    recons: f.valueForId(ae.recons.id)}}
}

class goBatch {
  constructor(coord, patches) {
    this.coord = coord
    this.patches = patches}
  batchSize() {
    return this.patches.length}
  encodeOrig() {
    return this.patches.map(encodePatch)}
  encodePred() {
    return (this.patches
	    .map(p => encodePatch(p.cloneWithNoNext())))}
  encodeWithNoise(noiseLevel) {
    return (this.patches
	    .map(p => encodePatch(p.cloneWithNoise(noiseLevel))))}}

function reportPrediction(batch, recons) {
  var numExamples = Math.min(10, batch.batchSize())
  for (var b = 0; b < numExamples; b++) {
    var patch = batch.patches[b]
    var re = decodeData(patch, recons[b])
    console.log(patch.toString())
    re.sort(function (a,b) {return b.doPlay - a.doPlay})
    var output = []
    for (var i = 0; i < 5; i++) {
      var r = re[i]
      output.push(r.coord.toString()
		  + ' '
		  + round(3, r.doPlay))}
    console.log(output.join('  ') + '\n')}}



function learn() {
  var noiseLevel = 0.40
  var minibatchSize = 100
  var dataSize = 203+2*25  // for 5x5
  var learnRate = 0.01

  console.log('noiseLevel', noiseLevel)
  console.log('minibatchSize', minibatchSize)
  console.log('learnRate', learnRate)
  
  var t = new ad.T()
  var input = new inputLayer(dataSize)
  var sa = new stackedAutoencoders(t,
				   input,
				   [{numFilters: 100}])

  // todo: loop over layers in sa
  // console.log('num parameters:', (numFilters+1)*(dataSize+1)-1)

  sa.learnCurrentLayer(minibatchSize)

  var count = 0
  var t = 1
  prepareMinibatches(
    5, 5, minibatchSize,
    function (batch) {
      if (batch.coord.toString() != 'A1') return true
      count++
      if (count == 50000)
	return false // end // todo: should depend on test err
      var modCount = count % 100
      if (modCount < 100-2*t)
	sa.learnBatch(batch, learnRate, noiseLevel)
      else {
	var predict = modCount >= 100-t
	if (!predict) {
	  var err = sa.testReconsBatch(batch)
	  console.log('test recons err', err)}
	else {
	  var res = sa.testPredictionBatch(batch)
	  console.log('test prediction err', res.err)
	  reportPrediction(batch, res.recons)
	}
      }
      return true})
  
  // var count = 0;

  // ////.....
  //     count++
  //     var cmod = count%100
  //     var nonoise = cmod > 90
  //     var test = cmod >= 99
  //     var start = +new Date()
  //     tr.bind(origInput, batch.obatch)
  //     tr.bind(noisedInput,
  // 	      (nonoise ? (test ? batch.pbatch : batch.obatch)
  // 	       : batch.nbatch))
  //     tr.bind(filters, filtersT)
  //     tr.bind(biasa, biasaT)
  //     tr.bind(biasb, biasbT)
  //     tr.call()
  //     var end = +new Date()
  //     var spent = end - start

  //     if (nonoise) {
  // 	if (test) {
  // 	  var rec = tr.valueForId(recons.id)
  // 	  for (var b = 0; b < Math.min(5, minibatchSize); b++) {
  // 	    var patch = batch.patches[b]
  // 	    var re = decodeData(patch, rec[b])
  // 	    console.log(patch.toString())
  // 	    re.sort(function (a,b) {return b.doPlay - a.doPlay})
  // 	    for (var i = 0; i < 5; i++) {
  // 	      var r = re[i]
  // 	      console.log(r.coord.toString(), r.doPlay)}
  // 	    console.log('\n')
  // 	  }
  // 	}
  //     }
  //     else {
  // })
}


learn()
