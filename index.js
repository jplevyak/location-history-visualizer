( function ( $, L, prettySize ) {
	var map, heat,
		heatOptions = {
			tileOpacity: 1,
			heatOpacity: 1,
			radius: 25,
			blur: 15
		};

	// Start at the beginning
	stageOne();

	function stageOne () {
		var dropzone;

		// Initialize the map
		map = L.map( 'map' ).setView([37.751541,-122.434198], 13);
		L.tileLayer( 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: 'location-history-visualizer is open source and available <a href="https://github.com/theopolisme/location-history-visualizer">on GitHub</a>. Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors.',
			maxZoom: 18,
			minZoom: 2
		} ).addTo( map );

		// Initialize the dropzone
		dropzone = new Dropzone( document.body, {
			url: '/',
			previewsContainer: document.createElement( 'div' ), // >> /dev/null
			clickable: false,
			accept: function ( file, done ) {
				stageTwo( file );
				dropzone.disable(); // Your job is done, buddy
			}
		} );

		// For mobile browsers, allow direct file selection as well
		$( '#file' ).change( function () {
			stageTwo( this.files[0] );
			dropzone.disable();
		} );
	}

	function stageTwo ( file ) {
		heat = L.heatLayer( [], heatOptions ).addTo( map );

		// First, change tabs
		$( 'body' ).addClass( 'working' );
		$( '#intro' ).addClass( 'hidden' );
		$( '#working' ).removeClass( 'hidden' );

		// Now start working!
		processFile( file );

		function status ( message ) {
			$( '#currentStatus' ).text( message );
		}

		function processFile ( file ) {
			var fileSize = prettySize( file.size ),
				reader = new FileReader();

			status( 'Preparing to import file (' + fileSize + ')...' );

			function getLocationDataFromJson ( data ) {
				var SCALAR_E7 = 0.0000001, // Since Google Takeout stores latlngs as integers
					locations = JSON.parse( data ).locations;

				if ( !locations || locations.length === 0 ) {
					throw new ReferenceError( 'No location data found.' );
				}

				return locations.map( function ( location ) {
					return [ location.latitudeE7 * SCALAR_E7, location.longitudeE7 * SCALAR_E7 ];
				} );
			}

			function CSVToArray( strData, strDelimiter ){
				// Check to see if the delimiter is defined. If not,
				// then default to comma.
				strDelimiter = (strDelimiter || ",");

				// Create a regular expression to parse the CSV values.
				var objPattern = new RegExp(
						(
						 // Delimiters.
						 "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +

						 // Quoted fields.
						 "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +

						 // Standard fields.
						 "([^\"\\" + strDelimiter + "\\r\\n]*))"
						),
						"gi"
						);


				// Create an array to hold our data. Give the array
				// a default empty first row.
				var arrData = [[]];

				// Create an array to hold our individual pattern
				// matching groups.
				var arrMatches = null;


				// Keep looping over the regular expression matches
				// until we can no longer find a match.
				while (arrMatches = objPattern.exec( strData )){

					// Get the delimiter that was found.
					var strMatchedDelimiter = arrMatches[ 1 ];

					// Check to see if the given delimiter has a length
					// (is not the start of string) and if it matches
					// field delimiter. If id does not, then we know
					// that this delimiter is a row delimiter.
					if (
							strMatchedDelimiter.length &&
							strMatchedDelimiter !== strDelimiter
					   ){

						// Since we have reached a new row of data,
						// add an empty row to our data array.
						arrData.push( [] );

					}

					var strMatchedValue;

					// Now that we have our delimiter out of the way,
					// let's check to see which kind of value we
					// captured (quoted or unquoted).
					if (arrMatches[ 2 ]){

						// We found a quoted value. When we capture
						// this value, unescape any double quotes.
						strMatchedValue = arrMatches[ 2 ].replace(
								new RegExp( "\"\"", "g" ),
								"\""
								);

					} else {

						// We found a non-quoted value.
						strMatchedValue = arrMatches[ 3 ];

					}


					// Now that we have our value string, let's add
					// it to the data array.
					arrData[ arrData.length - 1 ].push( strMatchedValue );
				}

				// Return the parsed data.
				return( arrData );
			}

			function getLocationDataFromCSV ( data ) {
				locations = CSVToArray( data );

				if ( !locations || locations.length === 0 ) {
					throw new ReferenceError( 'No location data found.' );
				}

				return locations.map( function ( location ) {
					var lat = Number(location[location.length - 2]);
                                        var lon = Number(location[location.length - 1]);
                                        if (lat && lon)
					  return [ Number(location[location.length - 2]), Number(location[location.length - 1]) ];
					else
					  return [ 0, 0 ];

				} );
			}

			function getLocationDataFromKml ( data ) {
				var KML_DATA_REGEXP = /<when>(.*?)<\/when>\s*<gx:coord>(\S*)\s(\S*)\s(\S*)<\/gx:coord>/g,
					locations = [],
					match = KML_DATA_REGEXP.exec( data );

				// match
				//  [1] ISO 8601 timestamp
				//  [2] longitude
				//  [3] latitude
				//  [4] altitude (not currently provided by Location History)

				while ( match !== null ) {
					locations.push( [ Number( match[3] ), Number( match[2] ) ] );
					match = KML_DATA_REGEXP.exec( data );
				}

				return locations;
			}

			reader.onprogress = function ( e ) {
				var percentLoaded = Math.round( ( e.loaded / e.total ) * 100 );
				status( percentLoaded + '% of ' + fileSize + ' loaded...' );
			};

			reader.onload = function ( e ) {
				var latlngs;

				status( 'Generating map...' );

				try {
					if ( /\.kml$/i.test( file.name ) ) {
						latlngs = getLocationDataFromKml( e.target.result );
					} else if ( /\.csv$/i.test( file.name ) ) {
						latlngs = getLocationDataFromCSV( e.target.result );
					} else {
						latlngs = getLocationDataFromJson( e.target.result );
					}
				} catch ( ex ) {
					status( 'Something went wrong generating your map. Ensure you\'re uploading a Google Takeout JSON file that contains location data and try again, or create an issue on GitHub if the problem persists. (error: ' + ex.message + ')' );
					return;
				}

				heat._latlngs = latlngs;

				heat.redraw();
				stageThree( /* numberProcessed */ latlngs.length );
			};

			reader.onerror = function () {
				status( 'Something went wrong reading your JSON file. Ensure you\'re uploading a "direct-from-Google" JSON file and try again, or create an issue on GitHub if the problem persists. (error: ' + reader.error + ')' );
			};

			reader.readAsText( file );
		}
	}

	function stageThree ( numberProcessed ) {
		var $done = $( '#done' );

		// Change tabs :D
		$( 'body' ).removeClass( 'working' );
		$( '#working' ).addClass( 'hidden' );
		$done.removeClass( 'hidden' );

		// Update count
		$( '#numberProcessed' ).text( numberProcessed.toLocaleString() );

		// Fade away when clicked
		$done.one( 'click', function () {
			$( 'body' ).addClass( 'map-active' );
			$done.fadeOut();
			activateControls();
		} );

		function activateControls () {
			var $tileLayer = $( '.leaflet-tile-pane' ),
				$heatmapLayer = $( '.leaflet-heatmap-layer' ),
				originalHeatOptions = $.extend( {}, heatOptions ); // for reset

			// Update values of the dom elements
			function updateInputs () {
				var option;
				for ( option in heatOptions ) {
					if ( heatOptions.hasOwnProperty( option ) ) {
						document.getElementById( option ).value = heatOptions[option];
					}
				}
			}

			updateInputs();

			$( '.control' ).change( function () {
				switch ( this.id ) {
					case 'tileOpacity':
						$tileLayer.css( 'opacity', this.value );
						break;
					case 'heatOpacity':
						$heatmapLayer.css( 'opacity', this.value );
						break;
					default:
						heatOptions[ this.id ] = Number( this.value );
						heat.setOptions( heatOptions );
						break;
				}
			} );

			$( '#reset' ).click( function () {
				$.extend( heatOptions, originalHeatOptions );
				updateInputs();
				heat.setOptions( heatOptions );
				// Reset opacity too
				$heatmapLayer.css( 'opacity', originalHeatOptions.heatOpacity );
				$tileLayer.css( 'opacity', originalHeatOptions.tileOpacity );
			} );
		}
	}

}( jQuery, L, prettySize ) );
