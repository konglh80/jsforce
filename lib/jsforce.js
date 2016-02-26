/**
 * @file JSforce API root object
 * @author Shinichi Tomita <shinichi.tomita@gmail.com>
 */

'use strict';

require('./api');
require('./registry');
var jsforce = require('./core');
if ( window ) {
  window.jsforce = jsforce;
}

module.exports = jsforce;
