var numNodes = 1000;
var numLinks = 10;
var numActiveNodes = 2;

var graph, layout, processingElement, container;

function getRand() {
  return 1 + Math.floor(Math.random() * numNodes);
}

function addLinks() {
  for (var i = 1; i <= numNodes; i++) {

    graph.addNode(i);
    /*if (i === 1) {
      graph.addLink(1, numNodes);
    } else {
      graph.addLink(i, i - 1);
    }*/
  }

  for (var i = 1; i <= numActiveNodes; i++) {
    var from = i;

    for (var j = 1; j <= numLinks; j++) {

      var to = getRand();
      if (from !== to) {
        graph.addLink(j, to);
      }
    }

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
  processingElement.innerHTML = 'Layout precompute: ' + iterations;
  if (iterations > 0) {
    setTimeout(function () {
        precompute(iterations, callback);
    }, 0); // keep going in next even cycle
  } else {
    // we are done!
    callback();
  }
}

function onLoad() {

  processingElement = document.getElementById('log');
  container = document.getElementById('graph-container');

  graph = Viva.Graph.graph();

  layout = Viva.Graph.Layout.forceDirected(graph, {
    springLength : 100,
    springCoeff : 0,
    dragCoeff : 0.01,
    gravity : -1.2,
    theta : 1
  });

  addLinks();

  // we need to compute layout, but we don't want to freeze the browser
  precompute(1000, renderGraph);

}

function renderGraph() {
  var graphics = Viva.Graph.View.webglGraphics();

  var renderer = Viva.Graph.View.renderer(graph, {
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
      }, 16);
    }
  }

}

