var express = require( 'express' ),
  fs = require( 'fs' ),
  bodyParser = require( 'body-parser' ),
  request = require( 'request' ),
  path = require( 'path' );

var runServer = function ( secondLevelDomain ) {
  var app = express();
  app.use( bodyParser.json( { limit: '10mb' } ) );
  app.use( bodyParser.urlencoded( {
    limit: '10mb',
    extended: false
  } ) );

  app.use( express.static( __dirname + '/public' ) );

  app.post( '/transfer-agent', function( req, res, next ) {
    var params = JSON.parse( req.body.params );
    console.log( JSON.stringify( params, null, 2 ) );
    if ( params.method === 'POST' ) {
      var options = {
        url: params.url,
        headers: params.headers || {}
      };

      if ( params.headers && params.headers[ 'Content-Type' ] === 'application/json' ) {
        options.json = true;

        options.body = JSON.parse( params.body );
      } else {
        options.form = params.body;
      }

      request.post( options, function ( err, response, body ) {
        if ( err ) {
          next( err );
        };

        if ( typeof body === 'object' ) {
          res.send( JSON.stringify( body ) );
        } else {
          res.send( body );  
        }
      } );
    } else if ( params.method === 'GET' ) {
      request.get( {
        url: params.url,
        headers: params.headers || {}
      }, function ( err, response, body ) {
        if ( err ) {
          next( err );
        };

        res.send( body );
      } );
    } else {
      res.status( 400 ).send( 'Error' );
    }
    
  } );

  app.listen( 8000 , function ( err ) {
    console.log( '' );
    console.log( 'http listening on port: 8000' );
  } );
};

runServer();
