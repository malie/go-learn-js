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
      line.push({col: st, libs: libs, next: coord.equals(co)})}
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
	  callback(co, take)}
	npl.set(idx, patches)}}
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
      add(o && o.next)
      add(o && !o.next)
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


function prepareMinibatches(pw, ph, minibatchSize, noiseLevel,
			    callback) {
  batchedPatchesPerPlace(
    pw, ph, minibatchSize,
    function (coord, patches) {
      // console.log('batch for', coord.toString())
      var obatch = []
      var nbatch = []
      for (var p of patches) {
	var noised = p.cloneWithNoise(noiseLevel)
	// console.log(p.toString())
	// console.log(noised.toString())
	obatch.push(encodePatch(p))
	nbatch.push(encodePatch(noised))}
      callback(coord, obatch, nbatch)})}


function learn() {
  var noiseLevel = 0.40
  
  var minibatchSize = 20
  var dataSize = 203+2*25  // for 5x5
  var numFilters = 40
  var learnRate = 0.01

  var t = new ad.T()
  var origInput = t.tensor('origInput', [minibatchSize, dataSize])
  var noisedInput = t.tensor('noisedInput', [minibatchSize, dataSize])
  var filters = t.tensor('filters', [numFilters, dataSize])
  var biasa = t.tensor('biasa', [numFilters])
  var biasb = t.tensor('biasb', [dataSize])

  var act = t.add(
    t.einsum('ac,bc->ab', noisedInput, filters),
    t.einsum('b,ab->ab', biasa, t.ones([minibatchSize, numFilters])))
  var repr = t.sigmoid(act)
  var reconsAct = t.add(
    t.einsum('ac,cb->ab', repr, filters),
    t.einsum('b,ab->ab', biasb, t.ones([minibatchSize, dataSize])))

  var recons = t.sigmoid(reconsAct)
  var err = t.squaredSum(t.sub(origInput, recons))

  var filtersT = ad.randomTensor([numFilters, dataSize], 0.03)
  var biasaT = ad.randomTensor([numFilters], 0.01)
  var biasbT = ad.randomTensor([dataSize], 0.01)

  console.log('num parameters:', (numFilters+1)*(dataSize+1)-1)
  
  console.log(util.inspect(err, 0, 10))
  var comp = new ad.asmjsCompiler(t)
  var tr = comp.compile(err, [filters, biasa, biasb])

  var count = 0;
  prepareMinibatches(
    5, 5, minibatchSize, noiseLevel,
    function (coord, obatch, nbatch) {
      if (coord.toString() != 'A1') return
      count++
      var nonoise = count%100 > 90
      var start = +new Date()
      tr.bind(origInput, obatch)
      tr.bind(noisedInput, nonoise ? obatch : nbatch)
      tr.bind(filters, filtersT)
      tr.bind(biasa, biasaT)
      tr.bind(biasb, biasbT)
      tr.call()
      var end = +new Date()
      var spent = end - start

      if (!nonoise) {
	filtersT = ad.zipTensor(filtersT,
    				tr.adjointForId(filters.id),
    				(a,b) => a-learnRate*b)
	biasaT = ad.zipTensor(biasaT,
    			      tr.adjointForId(biasa.id),
    			      (a,b) => a-learnRate*b)
	biasbT = ad.zipTensor(biasbT,
    			      tr.adjointForId(biasb.id),
    			      (a,b) => a-learnRate*b)}
	
      console.log(count, 'err', tr.valueForId(err.id), spent,
		  nonoise ? 'nonoise' : '')
    })}


learn()
