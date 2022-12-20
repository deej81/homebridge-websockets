'use strict';

var Utils = require('./utils.js').Utils;
var Service, Characteristic, Websocket;

Number.prototype.pad = function (len) {
  return (new Array(len + 1).join("0") + this).slice(-len);
}

module.exports = {
  Accessory: Accessory
}

function Accessory(params) {

  this.accessoryDef = params.accessoryDef;
  this.log = params.log;
  this.api = params.api;
  Service = params.Service;
  Characteristic = params.Characteristic;
  Websocket = params.Websocket;

  this.name = this.accessoryDef.name;
  this.service_name = this.accessoryDef.service;

  this.i_value = {};
  this.i_label = {};
  this.i_props = {};

  this.service;

  this.hap_accessories = {};
}

Accessory.prototype.save_and_setValue = function (trigger, c, value) {

  //this.log.debug("Accessory.save_and_setValue %s %s %s", trigger, c, value);

  var result = {};

  result = this.parseValue(c, value);

  if (result.isValid) {
    this.i_value[c] = result.value;
    this.setLabel(trigger, c);

    var context = this.i_label[c];
    //context is also used by the hap-server ('get' and 'set' event) - "context": {"keepalive":true, ...
    //this.log.debug("Accessory.save_and_setValue %s %s %s %s %s ", trigger, this.name, c, result.value, JSON.stringify(context));

    if (typeof (context) !== "undefined") {
      this.service.getCharacteristic(Characteristic[c]).setValue(result.value, null, context);
    }
    else {
      this.service.getCharacteristic(Characteristic[c]).setValue(result.value);
    }
  }
}

Accessory.prototype.saveValue = function (c, value) {

  var result = {};

  result = this.parseValue(c, value);

  if (result.isValid) {
    this.i_value[c] = result.value;
  }
}

Accessory.prototype.parseValue = function (c, value) {

  var isValid = true;

  var sc = this.service.getCharacteristic(Characteristic[c]);

  switch (sc.props.format) {
    case "bool":
      value = (value == 0 || value == false) ? false : true;
      break;

    case "int":
    case "uint8":
    case "uint16":
    case "uint32":
      value = parseInt(value);
      if (value < sc.props.minValue || value > sc.props.maxValue) {
        this.log.error("Accessory.parse %s %s value '%s' outside range.", this.name, c, value);
        isValid = false;
      }
      break;

    case "float":
      value = parseFloat(value);
      if (value < sc.props.minValue || value > sc.props.maxValue) {
        this.log.error("Accessory.parse %s %s value '%s' outside range.", this.name, c, value);
        isValid = false
      }
      break;

    default:
      // string, tlv8, 
      //value = undefined;
      this.log.debug("Accessory.parseValue %s %s %s %s", c, value, JSON.stringify(sc.props));
  }
  return { isValid: isValid, value: value };
}

Accessory.prototype.setLabel = function (trigger, c) {

  var now = new Date();
  var timestamp = now.getHours().pad(2) + ":" + now.getMinutes().pad(2) + ":" + now.getSeconds().pad(2);
  // +","+now.getMilliseconds(); 

  this.i_label[c] = {
    "timestamp": timestamp,
    "trigger": trigger
  };
}

Accessory.prototype.addService = function (newAccessory) {

  var isValid;

  if (typeof (Service[this.service_name]) !== "undefined") {
    var service = newAccessory.addService(Service[this.service_name], this.name);
    isValid = true;

    this.log.debug("Sevice list 1 %s", service)
    //this.log.debug("Sevice list %s",Service[this.service_name])
    if (newAccessory.context.service_name == "Television") {

      var SourceList = newAccessory.inputSources;
      this.log.debug("New Sevice list %s", SourceList)

      for (const i in SourceList) {
        this.log.debug("New Sevice list %s", SourceList[i])

        const InputService = newAccessory.addService(Service["InputSource"], SourceList[i].ConfiguredName, SourceList[i].ConfiguredName);

        InputService
          .setCharacteristic(Characteristic.Identifier, SourceList[i].Identifier)
          .setCharacteristic(Characteristic.ConfiguredName, SourceList[i].ConfiguredName)
          .setCharacteristic(Characteristic.IsConfigured, SourceList[i].IsConfigured)
          .setCharacteristic(Characteristic.InputSourceType, SourceList[i].InputSourceType)
          .setCharacteristic(Characteristic.InputDeviceType, SourceList[i].InputDeviceType);

        service.addLinkedService(InputService);
      }

      //const speakerService = newAccessory.addService(Service["TelevisionSpeaker"]);
      //speakerService
      //  .setCharacteristic(Characteristic.ConfiguredName, this.name)
      // .setCharacteristic(Characteristic.VolumeControlType, 3)

      //this.log.debug("linkedServices %s", service)

      //service.addLinkedService(speakerService);
    }


    //this.log.debug("Accessory.addService %s", JSON.stringify(service, null, 2));

  } else {
    //this.log.debug("Accessory.addService service '%s' undefined.", this.service_name);
    isValid = false;
  }
  return isValid;
}

Accessory.prototype.configureAccessory = function (accessory) {

  accessory.on('identify', function (paired, callback) { this.identify(paired, callback) }.bind(this));

  //this.service = accessory.getService(Service[this.service_name]);
  this.service = accessory.getService(this.name);

  //this.log.debug("Accessory.configureAccessory %s %s %s\n", this.name, this.service_name, JSON.stringify(this.service.characteristics));

  this.log.debug("Accessory.configureAccessory Def %s", JSON.stringify(this.accessoryDef));

  var c;
  for (var k in this.service.characteristics) {

    c = this.service.characteristics[k].displayName.replace(/\s/g, "");
    //this.log.debug("Accessory.configureAccessory %s %s %s", this.name, this.service_name, c);

    if (c != "Name") {
      this.allocate(c);
      this.setProps(c);
      this.i_value[c] = "blank";
      this.i_props[c] = JSON.parse(JSON.stringify(this.service.getCharacteristic(Characteristic[c]).props));
      //this.log.debug("Accessory.configureAccessory %s %s %s %s", this.name, this.service_name, c, JSON.stringify(this.i_props));
    }
  }

  // note: if the accessories are restored from cachedAccessories, the optionalCharacteristics are stored in characteristics.
  for (var k in this.service.optionalCharacteristics) {

    c = this.service.optionalCharacteristics[k].displayName.replace(/\s/g, "");

    if (typeof (this.accessoryDef[c]) !== "undefined") {
      this.log.debug("Accessory.configureAccessory %s %s optional %s", this.name, this.service_name, c);

      if (c != "Name") {
        this.allocate(c);
        this.setProps(c);
        this.i_value[c] = "blank";
        this.i_props[c] = JSON.parse(JSON.stringify(this.service.getCharacteristic(Characteristic[c]).props));
      }
    }
  }
  this.hap_accessories[this.name] = accessory;
}

Accessory.prototype.allocate = function (c) {

  var self = this;
  var sc = this.service.getCharacteristic(Characteristic[c]);

  sc.on('get', function (callback, context) { self.get(callback, context, this.displayName) });
  if (sc.props.perms.indexOf("pw") > -1) {
    //this.log.debug("Accessory.allocate 'set' event %s %s", this.name, c);
    sc.on('set', function (value, callback, context) { self.set(value, callback, context, this.displayName) });
  }
}

Accessory.prototype.setProps = function (c) {

  if (typeof (this.accessoryDef[c]) !== "undefined") {
    if (this.accessoryDef[c] != "default") {
      this.service.getCharacteristic(Characteristic[c]).setProps(this.accessoryDef[c]);
    }
    //this.log.debug("Accessory.setProps %s %s", this.name, c, this.accessoryDef[c]);
    //this.log.debug("Accessory.setProps %s %s", this.name, c, Characteristic[c]);
  }
}

Accessory.prototype.get = function (callback, context, displayName) {

  var c = displayName.replace(/\s/g, "");
  //this.log.debug("Accessory.get %s %s", this.name, c);

  Websocket.get(this.name, c, callback);

  var value;
  if (typeof (this.i_value[c]) !== "undefined" && this.i_value[c] !== "blank") {
    value = this.i_value[c];
  } else {
    value = null;
  }
  //this.log.debug("Accessory.get %s %s %s", this.name, c, value);
  //callback(null, value);
  if (value !== undefined && value !== null) {
    this.log.debug("Accessory.get %s %s %s", this.name, c, value);
    callback(null, value);
  } else {
    callback(new this.api.hap.HapStatusError(this.api.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE), null)
  }
}

Accessory.prototype.set = function (value, callback, context, displayName) {

  var c = displayName.replace(/\s/g, "");
  //this.log.debug("Accessory.set %s %s %s %s", this.name, c, value, JSON.stringify(context));
  //var serialnumber = WebsocketAccessory.setAccessoryInformation.serialnumber;
  //this.log.debug(JSON.stringify(this.service.characteristics));

  if (c == "On") value = (value == 0 || value == false) ? false : true;
  this.i_value[c] = value;

  if (typeof (context) !== "undefined" && typeof (context.trigger) === "undefined") {
    this.setLabel("homekit", c);
  }

  if (typeof (context) !== "undefined" && typeof (context.trigger) !== "undefined" && context.trigger.match(/websocket/g)) {
    //this.log.debug("Accessory.set %s %s %s - websocket", this.name, c, value);
    callback();
  } else {
    Websocket.set(this.name, c, value, callback);
  }
}

Accessory.prototype.identify = function (paired, callback) {

  this.log("Accessory.identify %s", this.name);
  // todo
  callback();
}

