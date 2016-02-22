"use strict";

const NODE_COLOR = 0xff00ff; // hex rrggbb
const NODE_SIZE = 16;

let emails = [];

// light -> dark
const COLORS = [
  0xB3E095FF,
  0x82BB5DFF,
  0x82BB5D80,
  0x59953280,
  0x599532FF,
  0x387013FF,
  0x387013FF,
  0x1E4B00FF,
  0x8B362650,
  0x8B362630
];

/*const COLORS = [
  0x1f77b4ff,
  0xaec7e8ff,
  0xff7f0eff,
  0xffbb78ff,
  0x2ca02cff,
  0x98df8aff,
  0xd62728ff,
  0xff9896ff,
  0x9467bdff,
  0xc5b0d5ff,
  0x8c564bff,
  0xc49c94ff,
  0xe377c2ff,
  0xf7b6d2ff,
  0x7f7f7fff,
  0xc7c7c7ff,
  0xbcbd22ff,
  0xdbdb8dff,
  0x17becfff,
  0x9edae5ff
];*/

var graph, domLabels, graphics, layout, renderer, processingElement, container, vertexShader, fragmentShader, mailboxesData, networkData;

class Utils {
  static getRandom(min = 1, max = NUM_NODES) {
    return min + Math.floor(Math.random() * max);
  }
  static roundToNearest(number, order = 10) {
    return Math.round(number / order) * order;
  }
  static toRangeIndex(num, max, divisions) {
    var temp = num / max;
    return Math.floor(temp * divisions);
  }
}


class QBCommGraph {
  constructor() {}

}

var activity = {};

function addNodes(data) {

  if (!data) {
    return addDummyNodes();
  }

  // data = _.sortBy(data, 'centrality');

  if (data && 'Mailbox' in data[0]) {
    console.log('Mailbox mode');

    createNodes(data, 'Mailbox');
    createLinks();
    createLabels(data, 'Mailbox');
    setActivityWeights();

  } else if (data && 'GroupName' in data[0]) {
    console.log('Group mode');

    createNodes(data, 'GroupName');
    createLinks();
    createLabels(data, 'GroupName');
  }



}

function setActivityWeights() {

}

function createLabels(data, keyName) {

  var labels = Object.create(null);

  for (var i = 0; i < data.length; i++) {
    var node = data[i];
    var id = data[i][keyName];

    var label = document.createElement('span');
    label.classList.add('node-label');
    label.innerText = node[keyName];
    labels[id] = label;
    container.appendChild(label);
  }
  // NOTE: If your graph changes over time you will need to
  // monitor graph changes and update DOM elements accordingly
  domLabels = labels;
}

var maxActivityWeight;

function createLinks() {
  for (var i = 0; i < networkData.length; i++) {
    var d = networkData[i];
    var total = parseInt(d.Count, 10);

    var from = d['Sender'];
    var to = d['Recipient'];

    activity[from] += total;
    activity[to] += total;

    graph.addLink(from, to, { total: total });
  }

  maxActivityWeight = _.max(activity);
  console.log('maxActivityWeight', maxActivityWeight);
}

function createNodes(data, keyName) {

  for (var i = 0; i < data.length; i++) {
    var nodeId = data[i][keyName];
    activity[nodeId] = 0;
    graph.addNode(data[i][keyName], data[i]);
  }

}

function precompute(iterations, callback) {
  // let's run 10 iterations per event loop cycle:
  var i = 0;
  while (iterations > 0 && i < 10) {
    layout.step();
    iterations--;
    i++;
  }
  processingElement.innerHTML = `Layout precompute: ${iterations}`;
  if (iterations > 0) {
    setTimeout(function () {
        precompute(iterations, callback);
    }, 0); // keep going in next even cycle
  } else {
    // we are done!
    callback();
  }
}

function onResizeHandler() {
  if (renderer) {
    renderer.reset();

  }
}

var numDataReceived = 0;
function onDataReceived() {

  numDataReceived++;

  if (numDataReceived < 2) {
    return;
  }

  addNodes(mailboxesData);

  // we need to compute layout, but we don't want to freeze the browser
  precompute(1000, renderGraph);
}

function onLoad() {

  processingElement = document.getElementById('log');
  container = document.getElementById('graph-container');
  vertexShader = document.getElementById('vertex-shader').innerHTML;
  fragmentShader = document.getElementById('fragment-shader').innerHTML;

  $.getJSON('data/mailboxes.json', data => {
    mailboxesData = data;
    onDataReceived();
  });
  $.getJSON('data/network.json', data => {
    networkData = data;
    onDataReceived();
  });

  graph = Viva.Graph.graph();

  layout = Viva.Graph.Layout.forceDirected(graph, {
    springLength : 100,
    springCoeff : 0.00001,
    dragCoeff : 0.05,
    gravity : -1.2,
    theta : 1
  });

  // addNodes();

  $('#reset').click(function () {
    renderer.reset();
  });

  $('#pause').click(function () {
    renderer.pause();
  });

  $('#position').click(function () {
    debugger
  });



  window.addEventListener('resize', onResizeHandler);

}

function placeNode(nodeUI, pos) {
  nodeUI.position.x = 0;
  nodeUI.position.y = pos.y;
}

function renderGraph() {
  graphics = Viva.Graph.View.webglGraphics();

  // first, tell webgl graphics we want to use custom shader
  // to render nodes:
  var circleNode = buildCircleNodeShader();
  graphics.setNodeProgram(circleNode);

  /*var curvedLink = buildCurvedLinkShader();
  graphics.setLinkProgram(curvedLink);*/

  graphics.placeNode(function(ui, pos) {
    // This callback is called by the renderer before it updates
    // node coordinate. We can use it to update corresponding DOM
    // label position;

    const INDEX = ui.id;
    const RADIUS = 1000.0;
    const LABEL_RADIUS = 1000.0;

    var nodeId = ui.node.data.Mailbox;
    let theta = 0;

    // base radial position on index
    let fract = INDEX / mailboxesData.length;

    // base radial position on activity
    let activityFract = activity[nodeId] / maxActivityWeight;

    theta = fract * 360;

    let thetaRadians = theta * (Math.PI / 180);

    const WEIGHT = activity[nodeId];

    let r = RADIUS - (900 * activityFract);
    let r2 = LABEL_RADIUS - (900 * activityFract);

    if (activityFract < 0.4) {
      r *= 1.2;
      r2 *= 1.2;
    }

    let x = Math.cos(thetaRadians) * r;
    let y = Math.sin(thetaRadians) * r;

    let x2 = Math.cos(thetaRadians) * r2;
    let y2 = Math.sin(thetaRadians) * r2;

    ui.position.x = x;
    ui.position.y = y;

    // we create a copy of layout position
    var domPos = {
      x: x2,
      y: y2
    };
    // And ask graphics to transform it to DOM coordinates:
    graphics.transformGraphToClientCoordinates(domPos);

    // then move corresponding dom label to its own position:
    var labelStyle = domLabels[nodeId].style;

    labelStyle.left = domPos.x + 'px';
    labelStyle.top = domPos.y + 'px';
  });

  // Step 4. Customize link appearance:
  //   As you might have guessed already the link()/placeLink()
  //   functions complement the node()/placeNode() functions
  //   and let us override default presentation of edges:
  /*graphics.link(function(link){
    return Viva.Graph.svg('path')
      .attr('stroke', 'yellow')
      .attr('stroke-dasharray', '5, 5');
  }).placeLink(function(linkUI, fromPos, toPos) {
    // linkUI - is the object returend from link() callback above.
    var data = 'M' + fromPos.x + ',' + fromPos.y +
               'L' + toPos.x + ',' + toPos.y;

    // 'Path data' (http://www.w3.org/TR/SVG/paths.html#DAttribute )
    // is a common way of rendering paths in SVG:
    linkUI.attr('d', data);
  });*/



  const MAX_EMAILS = parseInt(_.max(networkData, d => { return parseInt(d.Count, 10) }).Count, 10);

  // second, change the node ui model, which can be understood
  // by the custom shader:
  graphics.node(function(node, test) {
    return new WebglCircle(NODE_SIZE, NODE_COLOR);
  })
  .link(function(link) {

    // scale against 10 colors
    // 0 = brightest
    var index = COLORS.length - 1 - Utils.toRangeIndex(link.data.total, MAX_EMAILS, COLORS.length);

    if (!COLORS[index]) {
      index = 0;
    }

    return Viva.Graph.View.webglLine(COLORS[index]);
    // return Viva.Graph.View.webglLine(COLORS[(Math.random() * COLORS.length) << 0]);
   });



  renderer = Viva.Graph.View.renderer(graph, {
    graphics: graphics,
    layout: layout,
    container: container
  });
  renderer.run();

  // Final bit: most likely graph will take more space than available
  // screen. Let's zoom out to fit it into the view:
  var graphRect = layout.getGraphRect();
  var graphSize = Math.min(graphRect.x2 - graphRect.x1, graphRect.y2 - graphRect.y1);
  var screenSize = Math.min(document.body.clientWidth, document.body.clientHeight);

  var desiredScale = screenSize / graphSize;
  zoomOut(desiredScale, 1);

  function zoomOut(desiredScale, currentScale) {
    // zoom API in vivagraph 0.5.x is silly. There is no way to pass transform
    // directly. Maybe it will be fixed in future, for now this is the best I could do:
    if (desiredScale < currentScale) {
      currentScale = renderer.zoomOut();
      setTimeout(function () {
        zoomOut(desiredScale, currentScale);
      }, 1);
    }
  }

}

// Lets start from the easiest part - model object for node ui in webgl
function WebglCircle(size, color) {
  this.size = size;
  this.color = color;
}

// Next comes the hard part - implementation of API for custom shader
// program, used by webgl renderer:
function buildCircleNodeShader() {
  // For each primitive we need 4 attributes: x, y, color and size.
  const ATTRIBUTES_PER_PRIMITIVE = 4;

  var program,
      gl,
      buffer,
      locations,
      utils,
      webglUtils,
      nodes = new Float32Array(64),
      nodesCount = 0,
      canvasWidth,
      canvasHeight,
      transform,
      isCanvasDirty;

  return {
      /**
       * Called by webgl renderer to load the shader into gl context.
       */
      load : function (glContext) {
          gl = glContext;
          webglUtils = Viva.Graph.webgl(glContext);
          program = webglUtils.createProgram(vertexShader, fragmentShader);
          gl.useProgram(program);
          locations = webglUtils.getLocations(program, ['a_vertexPos', 'a_customAttributes', 'u_screenSize', 'u_transform']);

          gl.enableVertexAttribArray(locations.vertexPos);
          gl.enableVertexAttribArray(locations.customAttributes);

          buffer = gl.createBuffer();
      },

      /**
       * Called by webgl renderer to update node position in the buffer array
       *
       * @param nodeUI - data model for the rendered node (WebGLCircle in this case)
       * @param pos - {x, y} coordinates of the node.
       */
      position : function (nodeUI, pos) {

          var idx = nodeUI.id;
          nodes[idx * ATTRIBUTES_PER_PRIMITIVE] = pos.x;
          nodes[idx * ATTRIBUTES_PER_PRIMITIVE + 1] = -pos.y;
          nodes[idx * ATTRIBUTES_PER_PRIMITIVE + 2] = nodeUI.color;
          nodes[idx * ATTRIBUTES_PER_PRIMITIVE + 3] = nodeUI.size;
      },

      /**
       * Request from webgl renderer to actually draw our stuff into the
       * gl context. This is the core of our shader.
       */
      render : function() {
          gl.useProgram(program);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, nodes, gl.DYNAMIC_DRAW);

          if (isCanvasDirty) {
              isCanvasDirty = false;
              gl.uniformMatrix4fv(locations.transform, false, transform);
              gl.uniform2f(locations.screenSize, canvasWidth, canvasHeight);
          }

          gl.vertexAttribPointer(locations.vertexPos, 2, gl.FLOAT, false, ATTRIBUTES_PER_PRIMITIVE * Float32Array.BYTES_PER_ELEMENT, 0);
          gl.vertexAttribPointer(locations.customAttributes, 2, gl.FLOAT, false, ATTRIBUTES_PER_PRIMITIVE * Float32Array.BYTES_PER_ELEMENT, 2 * 4);

          gl.drawArrays(gl.POINTS, 0, nodesCount);
      },

      /**
       * Called by webgl renderer when user scales/pans the canvas with nodes.
       */
      updateTransform : function (newTransform) {
          transform = newTransform;
          isCanvasDirty = true;
      },

      /**
       * Called by webgl renderer when user resizes the canvas with nodes.
       */
      updateSize : function (newCanvasWidth, newCanvasHeight) {
          canvasWidth = newCanvasWidth;
          canvasHeight = newCanvasHeight;
          isCanvasDirty = true;
      },

      /**
       * Called by webgl renderer to notify us that the new node was created in the graph
       */
      createNode : function (node) {
          nodes = webglUtils.extendArray(nodes, nodesCount, ATTRIBUTES_PER_PRIMITIVE);
          nodesCount += 1;
      },

      /**
       * Called by webgl renderer to notify us that the node was removed from the graph
       */
      removeNode : function (node) {
          if (nodesCount > 0) { nodesCount -=1; }

          if (node.id < nodesCount && nodesCount > 0) {
              // we do not really delete anything from the buffer.
              // Instead we swap deleted node with the "last" node in the
              // buffer and decrease marker of the "last" node. Gives nice O(1)
              // performance, but make code slightly harder than it could be:
              webglUtils.copyArrayPart(nodes, node.id*ATTRIBUTES_PER_PRIMITIVE, nodesCount*ATTRIBUTES_PER_PRIMITIVE, ATTRIBUTES_PER_PRIMITIVE);
          }
      },

      /**
       * This method is called by webgl renderer when it changes parts of its
       * buffers. We don't use it here, but it's needed by API (see the comment
       * in the removeNode() method)
       */
      replaceProperties : function(replacedNode, newNode) {},
  };
}

