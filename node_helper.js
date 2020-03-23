/* Magic Mirror
 * Module: WaterLevels
 *
 * Node_helper written by sdetweil
 *  
 */
const NodeHelper = require('node_helper');
const request = require('request');
const path = require('path')
const zlib = require('zlib');
var moment = require('moment');
var cvt=require("xlsx-to-json")
var fs=require('fs')


module.exports = NodeHelper.create({

    self: 0,
    countries_loaded: [],
    country_index: 0,
    results: {},
   // using_chartjs: true,
    suspended: false,
    timer: null,
    lastUpdated: 0,
    url:"https://www.ecdc.europa.eu/sites/default/files/documents/COVID-19-geographic-disbtribution-worldwide-",

    start: function () {
      console.log("Starting module: " + this.name);
      self = this;
      self.lastUpdated = moment()
    },

    getInitialData: function (url, callback) {
      var date = new Date();
      var today= date.getFullYear()+"-"+("0"+(date.getMonth()+1)).substring(-2)+"-"+date.getDate() + ".xlsx"
      var texturl= url + today
      if(self.config.debug)
        console.log("fn="+texturl)
      var xf="rawdata"+"-"+today      
      request(
        {
          url: texturl,
          encoding: null,
          headers: {
            'Accept-Encoding': 'gzip'
          },
          gzip: true,
          method: 'GET'
        }, (error, response, body) => {
        if(self.config.debug)
          console.log("processing response error="+error+" response.code="+response.statusCode+" file="+xf)
        if (!error && response.statusCode === 200) {
              if(self.config.debug)
                console.log("have data")
              fs.writeFileSync(xf,body)
              cvt({
                  input: xf,  // input xls
                  output: null, // output json
                  //sheet: "sheet1",  // specific sheetname
                  rowsToSkip: 1 // number of rows to skip at the top of the sheet; defaults to 0
                }, function(err, result) {
                  if(err) {
                    console.error(err);
                  } else {
                    callback(result)
                  }
                }
              )
        } else if (error)
          console.log("===>error=" + JSON.stringify(error));
      }
      );
    },

     doGetcountries: function (init, data) {
      // if we are not suspended, and the last time we updated was at least the delay time,
      // then update again
			var now=moment()
			var elapsed= moment.duration(now.diff(self.lastUpdated,'minutes'))

			//console.log("getcountries elapsed time since last updated="+elapsed+" init="+init);
      if ((self.suspended == false &&  elapsed>= self.config.updateInterval) || init==true) {
        self.lastUpdated = moment()
        // clear the array of current data
        //console.log("getting recent pin data");
        self.countries_loaded = [];
        // get all the countries, callback when done

        // format data keyed by country name
        var   country= {}

        for(var entry of data){
            let v = entry["Countries and territories"]
            //console.log(" country geo="+JSON.stringify(entry))
            if(country[v]==undefined)
              country[v]=[]
            country[v].push(entry)
        }

        // loop thru all the configured countries 
        for(var c of this.config.countries)
        {          
          var totalc=0; var totald=0;
          var cases=[]; var deaths=[];
          var tcases=[]; var tdeaths=[];
          for(var u of country[c]){
             //console.log("date="+u.DateRep+" cases="+u.Cases+" deaths="+u.Deaths+" geoid="+u.GeoId)
             if(u.DateRep.endsWith("20")){
               cases.push({ x: u.DateRep+"20", y:parseInt(u.Cases)})
               deaths.push({ x: u.DateRep+"20", y:parseInt(u.Deaths)})
             }
          }
          // data presented in reverse dsate order, flip them
          cases=cases.reverse()
          deaths=deaths.reverse()
          // initialize cumulative counters to 0
          tcases=cases
          tdeaths=deaths
          // loop thru data and create cumulative counters
          for(var i=1 ; i< cases.length; i++){
            tcases[i].y+=tcases[i-1].y;
            tdeaths[i].y+=tdeaths[i-1].y
          }

          var d={'cases':cases, 'deaths':deaths,'cumulative_cases':tcases,'cumulative_deaths':tdeaths}
          if(this.config.debug)
            console.log("data returned ="+JSON.stringify(d))
          // add this country to the results
          self.results[c]=d
          // signify the country was counted
          self.countries_loaded.push(c)
        }
          // send the data on to the display module
        if(self.config.debug) console.log("data="+JSON.stringify(self.results))
        self.sendSocketNotification('Data', self.results)
      }
    },
    getData: function (init) {
      
			var now=moment()
			var elapsed= moment.duration(now.diff(self.lastUpdated,'minutes'))
      if(self.config.debug)
			  console.log("getData  elapsed time since last updated="+elapsed+" init="+init);
      if ((elapsed>= self.config.updateInterval) || init==true) {
 	      self.countries_loaded = [];
   	    self.getInitialData(self.url, function (data) {
          if(self.config.debug) console.log("data data="+JSON.stringify(data))
    	    self.doGetcountries(init, data);
      	});
			}
    },
    //Subclass socketNotificationReceived received.
    socketNotificationReceived: function (notification, payload) {
      if (notification === 'CONFIG') {
        this.config = payload;
        //console.log("config =" + JSON.stringify(payload));
        self.getData(true);
      }
      else if (notification === 'REFRESH') {
         self.getData(true);
      } else if (notification === 'SUSPEND') {
        self.suspended = true;
      } else if (notification === 'RESUME') {
        self.suspended = false;
        //self.getData(false);
      }

    },
  });