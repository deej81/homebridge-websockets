'use strict';

var util = require('util');
var Utils = require('./lib/utils.js').Utils;
var WebsocketAccessory = require('./lib/accessory.js').Accessory;
var Websocket = require('./lib/websocket.js').Websocket;

var Accessory, Service, Characteristic, UUIDGen;
var cachedAccessories = 0;

var platform_name = "websocket-dti";
var plugin_name = "homebridge-" + platform_name;
var storagePath;

module.exports = function (homebridge) {
  console.log("homebridge API version: " + homebridge.version);

  Accessory = homebridge.platformAccessory;

  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid; // Universally Unique IDentifier

  storagePath = homebridge.user.storagePath();

  homebridge.registerPlatform(plugin_name, platform_name, WebsocketPlatform, true);
}

function WebsocketPlatform(log, config, api) {

  this.log = log;
  this.api = api;
  this.accessories = {};
  this.hap_accessories = {};

  this.log.debug("storagePath = %s", storagePath);
  this.log.debug("config = %s", JSON.stringify(config));

  if (typeof (config) !== "undefined" && config !== null) {
    this.port = config.port || { "port": 4050 };
  } else {
    this.log.error("config undefined or null!");
    this.log("storagePath = %s", storagePath);
    process.exit(1);
  }

  var plugin_version = Utils.readPluginVersion();
  this.log("%s v%s", plugin_name, plugin_version);

  var params = {
    "log": this.log,
    "plugin_name": plugin_name,
    "port": this.port,
    "accessories": this.accessories,
    "Characteristic": Characteristic,
    "addAccessory": this.addAccessory.bind(this),
    "removeAccessory": this.removeAccessory.bind(this),
    "getAccessories": this.getAccessories.bind(this),
    "getSingleAccessories": this.getSingleAccessories.bind(this),
    "setAccessoryInformation": this.setAccessoryInformation.bind(this),
    "configureAccessory": this.configureAccessory.bind(this)

  }
  this.Websocket = new Websocket(params);

  Utils.read_npmVersion(plugin_name, function (npm_version) {
    if (npm_version > plugin_version) {
      this.log("A new version %s is avaiable", npm_version);
    }
  }.bind(this));

  if (api) {
    this.api = api;

    this.api.on('didFinishLaunching', function () {
      this.log("Plugin - DidFinishLaunching");

      this.Websocket.startServer();

      this.log.debug("Number of cached Accessories: %s", cachedAccessories);
      this.log("Number of Accessories: %s", Object.keys(this.accessories).length);

    }.bind(this));
    //this.log.debug("WebsocketPlatform %s", JSON.stringify(this.accessories));
  }
}

WebsocketPlatform.prototype.addAccessory = function (accessoryDef) {

  var name = accessoryDef.name;
  var ack, message;
  var isValid;
  var service_type = accessoryDef.service;
  var manufacturer = accessoryDef.manufacturer;
  var model = accessoryDef.model;
  var serialnumber = accessoryDef.serialnumber;
  var firmwarerevision = accessoryDef.firmwarerevision;
  var service_name;

  if (!this.accessories[name]) {             //accessoryDef.accessories[name].setAccessoryInformation.serialnumber
    var uuid = UUIDGen.generate(name);

    var newAccessory = new Accessory(name, uuid);
    newAccessory.reachable = true;
    newAccessory.context.service_name = accessoryDef.service;

    if (accessoryDef.service == "Television") {
      newAccessory.inputSources = accessoryDef.inputSources
      this.log.debug("inputSources = %s", newAccessory.inputSources);
    }

    //this.log.debug("addAccessory UUID = %s", newAccessory.UUID);

    var i_accessory = new WebsocketAccessory(this.buildParams(accessoryDef));
    isValid = i_accessory.addService(newAccessory);
    if (isValid) {
      i_accessory.configureAccessory(newAccessory);

      this.accessories[name] = i_accessory;
      this.hap_accessories[name] = newAccessory;
      this.api.registerPlatformAccessories(plugin_name, platform_name, [newAccessory]);

      ack = true;
      message = "accessory '" + name + "' is added.";
    } else {
      ack = false;
      message = "service '" + accessoryDef.service + "' undefined.";
    }
  } else {
    ack = false;
    message = "name '" + name + "' is already used.";
  }
  this.log("addAccessory %s", message);
  this.Websocket.sendAck(ack, message);
  if (ack) {
    var now = new Date().toISOString().slice(0, 16);
    var plugin_version = Utils.readPluginVersion();
    var plugin_v = "v" + plugin_version;
    if (typeof manufacturer === "undefined") {
      manufacturer = plugin_name;
    }
    if (typeof model === "undefined") {
      model = plugin_v;
    }
    if (typeof serialnumber === "undefined") {
      serialnumber = now;
    }
    if (typeof firmwarerevision === "undefined") {
      firmwarerevision = plugin_version;
    }
    this.setAccessoryInformation({ "name": name, "manufacturer": manufacturer, "model": model, "serialnumber": serialnumber, "firmwarerevision": firmwarerevision }, false);
  }
}

WebsocketPlatform.prototype.setAccessoryInformation = function (accessory) {

  this.log.debug("WebsocketPlatform.setAccessoryInformation %s", JSON.stringify(accessory));
  var message;
  var ack;
  var name = accessory.name;

  if (typeof this.hap_accessories[name] === "undefined") {
    ack = false; message = "accessory '" + name + "' undefined.";
  } else {
    var service = this.hap_accessories[name].getService(Service.AccessoryInformation);

    if (typeof accessory.manufacturer !== "undefined") {
      service.setCharacteristic(Characteristic.Manufacturer, accessory.manufacturer);
      ack = true;
    }
    if (typeof accessory.model !== "undefined") {
      service.setCharacteristic(Characteristic.Model, accessory.model);
      ack = true;
    }
    if (typeof accessory.serialnumber !== "undefined") {
      service.setCharacteristic(Characteristic.SerialNumber, accessory.serialnumber);
      ack = true;
    }
    if (typeof accessory.firmwarerevision !== "undefined") {
      service.setCharacteristic(Characteristic.FirmwareRevision, accessory.firmwarerevision);
      ack = true;
    }

    if (ack) {
      message = "accessory '" + name + "', accessoryinformation is set.";
    } else {
      message = "accessory '" + name + "', accessoryinforrmation properties undefined.";
    }
  }
  this.Websocket.sendAck(ack, message);
}

WebsocketPlatform.prototype.configureAccessory = function (accessory) {

  //this.log.debug("configureAccessory %s", JSON.stringify(accessory.services, null, 2));

  cachedAccessories++;
  var name = accessory.displayName;
  var uuid = accessory.UUID;

  var accessoryDef = {};
  accessoryDef.name = name;
  accessoryDef.service = accessory.context.service_name;

  if (this.accessories[name]) {
    this.log.error("configureAccessory %s UUID %s already used.", name, uuid);
    process.exit(1);
  }

  accessory.reachable = true;

  var i_accessory = new WebsocketAccessory(this.buildParams(accessoryDef));
  i_accessory.configureAccessory(accessory);

  this.accessories[name] = i_accessory;
  this.hap_accessories[name] = accessory;
}

WebsocketPlatform.prototype.removeAccessory = function (name) {

  var ack, message;

  if (typeof (this.accessories[name]) !== "undefined") {
    this.log.debug("removeAccessory '%s'", name);
    // Add to get Serial Number before Deleting
    var newService = this.hap_accessories[name].getService(Service.AccessoryInformation);
    var serial_Number = newService.characteristics[4].value;
    var service_Name = newService.characteristics[2].value;
    //

    this.api.unregisterPlatformAccessories(plugin_name, platform_name, [this.hap_accessories[name]]);
    delete this.accessories[name];
    delete this.hap_accessories[name];
    ack = true;
    message = "accessory '" + name + "' is removed.";
    this.Websocket.sendAck(ack, message, serial_Number, service_Name)
  } else {
    ack = false;
    message = "accessory '" + name + "' not found.";
    this.Websocket.sendAck(ack, message)
  }
  this.log("removeAccessory %s", message);
  //this.Websocket.sendAck(ack, message,serial_Number);
}

WebsocketPlatform.prototype.getAccessories = function (name) {

  var accessories = {};
  var def = {};
  var service, characteristics, serialnumber;

  switch (name) {
    case "all":
      for (var k in this.accessories) {
        //this.log("getAccessories %s", JSON.stringify(this.accessories[k], null, 2));
        service = this.accessories[k].service_name;
        characteristics = this.accessories[k].i_value;
        def = { "service": service, "characteristics": characteristics };
        accessories[k] = def;
      }
      break;

    default:
      service = this.accessories[name].service_name;
      characteristics = this.accessories[name].i_value;

      var service = this.hap_accessories[name].getService(Service.AccessoryInformation);
      //this.log.debug(service);

      this.log.debug(service.characteristics[4].value);
      var serial_Number = service.characteristics[4].value;

      def = { "service": service, "characteristics": characteristics, "serialnumber": serial_Number };
      accessories[name] = def;
  }

  //this.log("getAccessory %s", JSON.stringify(accessories, null, 2));
  this.Websocket.sendAccessories(accessories);
}

WebsocketPlatform.prototype.getSingleAccessories = function (name) {

  var accessories = {};
  var def = {};
  var service, characteristics, serialnumber;

  switch (name) {
    case "all":
      for (var k in this.accessories) {
        //this.log("getAccessories %s", JSON.stringify(this.accessories[k], null, 2));
        service = this.accessories[k].service_name;
        characteristics = this.accessories[k].i_value;
        def = { "service": service, "characteristics": characteristics };
        accessories[k] = def;
      }
      break;

    default:
      service = this.accessories[name].service_name;
      characteristics = this.accessories[name].i_value;

      var newService = this.hap_accessories[name].getService(Service.AccessoryInformation);
      //this.log.debug(service);

      //this.log.debug(service.characteristics[4].value);
      var serial_Number = newService.characteristics[4].value

      return def = { "service": service, "characteristics": characteristics, "serialnumber": serial_Number };
    //accessories[name] = def;
  }

  //this.log("getAccessory %s", JSON.stringify(accessories, null, 2));
  // this.Websocket.sendAccessories(accessories);
}
WebsocketPlatform.prototype.buildParams = function (accessoryDef) {

  var params = {
    "accessoryDef": accessoryDef,
    "log": this.log,
    "Service": Service,
    "Characteristic": Characteristic,
    "Websocket": this.Websocket,
    "api": this.api,

  }
  //this.log.debug("configureAccessories %s", JSON.stringify(params.accessory_config));
  return params;
}

