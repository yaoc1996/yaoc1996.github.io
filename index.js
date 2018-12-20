const ZIPCODE_URL = "https://raw.githubusercontent.com/hvo/datasets/master/nyc_zip.geojson";

let defaultComplaints = {},
    selectedComplaint = '',
    selectedMonth     = '',
    complaintScale    = null,
    monthScale        = null,
    complaintMax      = null,
    monthMax          = null;

d3.queue()
	.defer(d3.json, ZIPCODE_URL)
	.await(initVis);

function initVis(error, zipcodes) {
  let	map       = d3.select('#canvas').append('div').attr('id', 'map'),
      gui       = d3.select('#canvas').append('div').attr('id', 'gui');

  gui.append('svg').attr('id', 'complaint-filter');
  gui.append('br');
  gui.append('br');
  gui.append('svg').attr('id', 'month-filter');


  let baseMap = renderBaseMap(),
      client  = new carto.Client({
        apiKey: 'efa703fa7b21d16711a560f97008f5de2e6cda41',
        username: 'yaoc1996',
      });

  let locationSource = createCartoLayer(client, baseMap);

  Promise.all([
    loadComplaintTypes(client, 30),
    loadMonths(client)
  ])
    .then(([p1, p2]) => {
      complaintSource = p1[0];
      monthSource = p2[0];

      let handler = queryHandler(locationSource, p1[0], p2[0]);

      types = _.filter(p1[1], t => t.name != 'N/A' && t.name != 'Other')
      renderComplaintTypeFilter(types.slice(0, 10), handler);

      renderMonthFilter(p2[1], handler); });

  //renderMap(baseMap, zipcodes)
}

function renderBaseMap() {
  const lightUrl = 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png';

  let center    = [40.7, -73.975],
      baseLight = L.tileLayer(lightUrl, { maxZoom: 18, }),
      dMap      = L.map('map', {
				center: center,
        zoom: 12,
        layers: [baseLight],
      }),
      svg       = d3.select(dMap.getPanes().overlayPane).append('svg'),
      g         = svg.append('g').attr('class', 'leaflet-zoom-hide');

  L.control.layers({
    Light: baseLight,
  }).addTo(dMap);

	let infoBox = L.control({ position: 'bottomleft' });

	infoBox.onAdd = function (map) {
		var div = L.DomUtil.create('div', 'infobox');
		return div;
	};
	infoBox.addTo(dMap);

	return [svg, g, dMap];
}

function renderMap(baseMap, zipcodes) {

  function projectPoint(x, y) {
    let point = dMap.latLngToLayerPoint(new L.LatLng(y, x));
    this.stream.point(point.x, point.y);
  }

  let projection = d3.geoTransform({point: projectPoint}),
      path       = d3.geoPath().projection(projection),
      svg        = baseMap[0],
      g          = baseMap[1],
      dMap       = baseMap[2];

  let legendControl   = L.control({position: 'topleft'});

  legendControl.onAdd = addLegendToMap;
  legendControl.addTo(dMap);

  dMap.on("zoomend", reproject);
  reproject();

  function addLegendToMap(map) {
    let div    = L.DomUtil.create('div', 'legendbox'),
        ndiv   = d3.select(div)
                   .style("left", "50px")
                   .style("top", "-75px"),
        lsvg   = ndiv.append("svg"),
        legend = lsvg.append("g")
                   .attr("class", "legend")
                   .attr("transform", "translate(0, 20)");
    legend.append("text")
      .attr("class", "axis--map--caption")
      .attr("y", -6);

    return div;
  };

  function reproject() {
		bounds = path.bounds(zipcodes);
    let topLeft     = bounds[0],
        bottomRight = bounds[1];
    svg.attr("width", bottomRight[0] - topLeft[0])
      .attr("height", bottomRight[1] - topLeft[1])
      .style("left", topLeft[0] + "px")
      .style("top", topLeft[1] + "px");

    g.attr("transform", `translate(${-topLeft[0]}, ${-topLeft[1]})`);

    let zipShapes = g.selectAll(".zipcode")
      .data(zipcodes.features); // we rejoin the data

    zipShapes
      .enter().append("path")
        .attr("class", "zipcode")
      .merge(zipShapes) // and perform updates on both match and unmatches
        .attr("d", path);
  }
}

function createCartoLayer(client, baseMap) {
  let source = new carto.source.SQL(`
    SELECT * FROM call_requests
    WHERE complaint_type=''
  `)

  let style = new carto.style.CartoCSS(`
    #layer {
      marker-width: 4;
      marker-line-width: 0;
      marker-fill: steelblue;
    }
  `)

  let layer = new carto.layer.Layer(source, style);
  client.addLayer(layer);
  client.getLeafletLayer().addTo(baseMap[2]);

  return source;
}

function queryHandler(source, csource, msource) {
  let type  = '',
      month = '';

  function updateQuery() {
    if (type != '' && month != '') {
      source.setQuery(`
        SELECT * FROM call_requests
        WHERE the_geom is not null AND complaint_type='${type}'
                                   AND month='${month}'
      `)
    } else if (month != '') {
      source.setQuery(`
        SELECT * FROM call_requests
        WHERE the_geom is not null AND month='${month}'
      `)
    } else {
      source.setQuery(`
        SELECT * FROM call_requests
        WHERE the_geom is not null AND complaint_type='${type}'
      `)
    }

    if (type != '') {
      msource.setQuery(`
        SELECT * FROM call_requests
        WHERE the_geom is not null AND complaint_type='${type}'
      `)
    } else {
      msource.setQuery(`
        SELECT * FROM call_requests
        WHERE the_geom is not null
      `)
    }

    if (month != '') {
      csource.setQuery(`
        SELECT * FROM call_requests
        WHERE the_geom is not null AND month='${month}'
      `)
    } else {
      csource.setQuery(`
        SELECT * FROM call_requests
        WHERE the_geom is not null
      `)
    }
  }

  return {
    updateType(t) {
      type = t;
      updateQuery();
    },
    updateMonth(m) {
      month = m;
      updateQuery();
    }
  }
}

function loadComplaintTypes(client, n) {
  const source = new carto.source.SQL(`
    SELECT * FROM call_requests
    WHERE the_geom is not null
  `);
  const view = new carto.dataview.Category(
    source,
    'complaint_type',
    {
      operation: carto.operation.COUNT,
      limit: n,
    }
  );

  client.addDataview(view);

  return new Promise(resolve => {
    view.on('dataChanged', newData => {
      view.off('dataChanged');
      view.on('dataChanged', newData => {
        console.log('type changed')
        const types = orderComplaints(newData.categories);

        const SELECTION_HEIGHT  = 20,
              SELECTION_PADDING = 2,
              TOP_OFFSET        = 24,
              BAR_OFFSET        = 140,
              PADDING           = 6,
              WIDTH             = 420;

        complaintMax = Math.max(..._.map(types, t => t.value))

        complaintScale = d3
          .scaleLinear()
          .domain([0, complaintMax]) .range([0, WIDTH - BAR_OFFSET])

        d3.select('.complaint-axis--x')
          .attr('transform', `translate(${BAR_OFFSET}, ${SELECTION_HEIGHT * types.length + 36})`)
          .call(d3.axisBottom(complaintScale).ticks(5).tickFormat(d3.format('.0s')))

        const newBars = d3.selectAll('.complaint-bar')
          .data(types)

        newBars
          .enter()
          .append('rect')
          .merge(newBars)
          .transition()
          .duration(300)
          .attr('class', d => {
            if (d.name == selectedComplaint) {
              return 'complaint-bar selected'
            } else {
              return 'complaint-bar'
            }
          })
          .attr('width', d => {
            if (d.name == selectedComplaint) {
              return BAR_OFFSET + complaintScale(d.value);
            } else {
              return complaintScale(d.value)
            }
          })
      })
      resolve([source, newData.categories]);
    });
  })
}

function loadMonths(client) {
  const source = new carto.source.SQL(`
    SELECT * FROM call_requests
    WHERE the_geom is not null
  `);
  const view = new carto.dataview.Category(
    source,
    'month',
    {
      operation: carto.operation.COUNT,
      limit: 13,
    }
  );

  client.addDataview(view);

  return new Promise(resolve => {
    view.on('dataChanged', newData => {
      view.off('dataChanged');
      console.log('old')
      view.on('dataChanged', newData => {
        console.log('month changed')
        const SELECTION_WIDTH   = 20,
              SELECTION_PADDING = 2,
              TOP_OFFSET        = 24,
              BOT_OFFSET        = 36,
              BAR_OFFSET        = 140,
              WIDTH             = 420,
              HEIGHT            = 240;

        const months = orderMonths(newData.categories);

        monthMax = Math.max(..._.map(months, t => t.value))

        monthScale = d3
          .scaleLinear()
          .domain([monthMax, 0])
          .range([0, HEIGHT - TOP_OFFSET - BOT_OFFSET])

        d3.select('.month-axis--y')
          .call(d3.axisLeft(monthScale).ticks(5).tickFormat(d3.format('.0s')))
          .attr('transform', `translate(${BAR_OFFSET - 8}, ${TOP_OFFSET})`)

        const newBars = d3.selectAll('.month-bar')
          .data(months)


        newBars
          .enter()
          .merge(newBars)
          .transition()
          .duration(300)
          .attr('class', d => {
            if (d.name == selectedMonth) {
              return 'month-bar selected'
            } else {
              return 'month-bar'
            }
          })
          .attr('y', d => HEIGHT - monthScale(monthMax - d.value) - BOT_OFFSET)
          .attr('height', d => {
            if (d.name == selectedMonth) {
              return monthScale(monthMax - d.value) + BOT_OFFSET;
            } else {
              return monthScale(monthMax - d.value);
            }
          })
      })
      resolve([source, newData.categories]);
    });
  })
}

function orderComplaints(types) {
  types = _.map(types, (t, idx) => {
    t.int_value = defaultComplaints[t.name]
    return t
  })

  return _.sortBy(types, t => t.int_value)
}

function renderComplaintTypeFilter(types, handler) {
  const SELECTION_HEIGHT  = 20,
        SELECTION_PADDING = 2,
        TOP_OFFSET        = 24,
        BAR_OFFSET        = 140,
        PADDING           = 6,
        WIDTH             = 420;

  _.forEach(types, (t, idx) => {
    defaultComplaints[t.name] = idx;
  })

  complaintMax = Math.max(..._.map(types, t => t.value))

  const filter = d3.select('#complaint-filter')

  filter
    .attr('width', WIDTH)
    .attr('height', SELECTION_HEIGHT * types.length + TOP_OFFSET + PADDING * 2 + 24)
    .append('text')
      .attr('x', BAR_OFFSET)
      .attr('y', 16 + PADDING)
      .style('font-weight', '600')
      .text(`Top ${types.length} Complaint Types`)

  const filterSelections = filter
    .selectAll()
    .data(types)
    .enter()

  complaintScale = d3
    .scaleLinear()
    .domain([0, complaintMax]) .range([0, WIDTH - BAR_OFFSET])

  const offset = TOP_OFFSET+SELECTION_PADDING+PADDING;
  const yScale = d3
    .scaleLinear()
    .domain([0, types.length-1])
    .range([offset, (types.length-1) * SELECTION_HEIGHT + offset])

  filterSelections
    .append('rect')
      .attr('id', d => 'bar-' + d.name.replace(/\/| /g, ''))
      .attr('class', 'complaint-bar')
      .attr('x', BAR_OFFSET)
      .attr('y', (d, idx) => yScale(idx))
      .attr('width', d => complaintScale(d.value))
      .attr('height', SELECTION_HEIGHT - SELECTION_PADDING * 2)
      .attr('fill', 'salmon')

  filter.append("g")
    .attr("class", "axis axis--x complaint-axis--x")
    .attr('transform', `translate(${BAR_OFFSET}, ${SELECTION_HEIGHT * types.length + 36})`)
    .call(d3.axisBottom(complaintScale).ticks(5).tickFormat(d3.format('.0s')))

  filter.append("g")
    .attr("class", "axis axis--y no-display")
    .call(d3.axisLeft(yScale).ticks(types.length).tickFormat((d, i) => types[i].name))
    .attr('transform', `translate(${BAR_OFFSET - 5}, ${SELECTION_HEIGHT / 2 - 2})`)

  filterSelections
    .append('rect')
      .attr('x', 0)
      .attr('y', (d, idx) => yScale(idx)-1)
      .attr('width', WIDTH)
      .attr('height', SELECTION_HEIGHT - SELECTION_PADDING)
      .attr('fill', 'white')
      .style('opacity', '0.1')
      .on('click', d => {
        filter.select('#bar-' + selectedComplaint.replace(/\/| /g, ''))
          .transition()
          .duration(300)
          .attr('class', 'complaint-bar')
          .attr('x', BAR_OFFSET)
          .attr('width', d => complaintScale(d.value))
          .style('fill', 'salmon')

        if (selectedComplaint != d.name) {
          filter.select('#bar-' + d.name.replace(/\/| /g, ''))
            .transition()
            .duration(300)
            .attr('class', 'complaint-bar selected')
            .attr('x', 0)
            .attr('width', d => complaintScale(d.value) + BAR_OFFSET)
            .style('fill', 'steelblue')

          selectedComplaint = d.name;
        } else {
          selectedComplaint = '';
        }

        handler.updateType(selectedComplaint);
      })
}

function orderMonths(months) {
  const MAPPING = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11
  };

  months = _.map(months, (m, idx) => {
    m.int_value = MAPPING[m.name]
    return m
  })

  months = _.sortBy(months, m => m.int_value)

  return months
}

function renderMonthFilter(months, handler) {
  months = orderMonths(months);

  const SELECTION_WIDTH   = 20,
        SELECTION_PADDING = 2,
        TOP_OFFSET        = 24,
        BOT_OFFSET        = 36,
        BAR_OFFSET        = 140,
        WIDTH             = 420,
        HEIGHT            = 240;

  monthMax = Math.max(..._.map(months, t => t.value))

  const filter = d3.select('#month-filter')

  filter
    .attr('width', WIDTH)
    .attr('height', HEIGHT)
    .append('text')
      .attr('x', BAR_OFFSET) .attr('y', 16)
      .style('font-weight', '600')
      .text('Complaints By Month')

  const filterSelections = filter
    .selectAll()
    .data(months)
    .enter()

  const xScale = d3
    .scaleLinear()
    .domain([0, months.length-1])
    .range([BAR_OFFSET, months.length * SELECTION_WIDTH + SELECTION_PADDING * 2 + BAR_OFFSET])

  monthScale = d3
    .scaleLinear()
    .domain([monthMax, 0])
    .range([0, HEIGHT - TOP_OFFSET - BOT_OFFSET])

  filterSelections
    .append('rect')
      .attr('id', d => 'bar-' + d.name.replace(/\/| /g, ''))
      .attr('class', 'month-bar')
      .attr('x', (d, idx) => xScale(idx) + SELECTION_PADDING)
      .attr('y', d => HEIGHT - monthScale(monthMax - d.value) - BOT_OFFSET)
      .attr('width', SELECTION_WIDTH - SELECTION_PADDING)
      .attr('height', d => monthScale(monthMax - d.value))
      .attr('fill', 'salmon')

  filter.append("g")
    .attr("class", "axis axis--x no-display month-axis--x")
    .attr('transform', `translate(${SELECTION_WIDTH / 2 - 2}, ${HEIGHT - BOT_OFFSET + 5})`)
    .call(d3.axisBottom(xScale).ticks(months.length).tickFormat((d, i) => months[i].name))

  d3.selectAll('.month-axis--x text')
    .attr('transform', 'rotate(-45, -6, 8), translate(-6, 8)')

  filter.append("g")
    .attr("class", "axis axis--y month-axis--y")
    .attr('transform', `translate(${BAR_OFFSET - 8}, ${TOP_OFFSET})`)
    .call(d3.axisLeft(monthScale).ticks(5).tickFormat(d3.format('.0s')))

  filterSelections
    .append('rect')
      .attr('x', (d, idx) => xScale(idx)+1)
      .attr('y', TOP_OFFSET)
      .attr('width', SELECTION_WIDTH)
      .attr('height', HEIGHT - TOP_OFFSET)
      .attr('fill', 'white')
      .style('opacity', '0.1')
      .on('click', d => {
        filter.select('#bar-' + selectedMonth.replace(/\/| /g, ''))
          .transition()
          .duration(300)
          .attr('class', 'month-bar')
          .attr('height', d => monthScale(monthMax - d.value))
          .style('fill', 'salmon')

        if (selectedMonth != d.name) {
          filter.select('#bar-' + d.name.replace(/\/| /g, ''))
            .transition()
            .duration(300)
            .attr('class', 'month-bar selected')
            .attr('height', d => monthScale(monthMax - d.value) + BOT_OFFSET)
            .style('fill', 'steelblue')

          selectedMonth = d.name;
        } else {
          selectedMonth = '';
        }

        handler.updateMonth(selectedMonth);
      })
}
