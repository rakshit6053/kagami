/* Config Sample
 *
 * For more information on how you can configure this file
 * see https://docs.magicmirror.builders/configuration/introduction.html
 * and https://docs.magicmirror.builders/modules/configuration.html
 *
 * You can use environment variables using a `config.js.template` file instead of `config.js`
 * which will be converted to `config.js` while starting. For more information
 * see https://docs.magicmirror.builders/configuration/introduction.html#enviromnent-variables
 */
let config = {
	address: "localhost",	// Address to listen on, can be:
							// - "localhost", "127.0.0.1", "::1" to listen on loopback interface
							// - another specific IPv4/6 to listen on a specific interface
							// - "0.0.0.0", "::" to listen on any interface
							// Default, when address config is left out or empty, is "localhost"
	port: 8080,
	basePath: "/",	// The URL path where MagicMirror² is hosted. If you are using a Reverse proxy
									// you must set the sub path here. basePath must end with a /
	ipWhitelist: ["127.0.0.1", "::ffff:127.0.0.1", "::1"],	// Set [] to allow all IP addresses
									// or add a specific IPv4 of 192.168.1.5 :
									// ["127.0.0.1", "::ffff:127.0.0.1", "::1", "::ffff:192.168.1.5"],
									// or IPv4 range of 192.168.3.0 --> 192.168.3.15 use CIDR format :
									// ["127.0.0.1", "::ffff:127.0.0.1", "::1", "::ffff:192.168.3.0/28"],

	useHttps: false,			// Support HTTPS or not, default "false" will use HTTP
	httpsPrivateKey: "",	// HTTPS private key path, only require when useHttps is true
	httpsCertificate: "",	// HTTPS Certificate path, only require when useHttps is true

	language: "en",
	locale: "en-US",   // this variable is provided as a consistent location
			   // it is currently only used by 3rd party modules. no MagicMirror code uses this value
			   // as we have no usage, we  have no constraints on what this field holds
			   // see https://en.wikipedia.org/wiki/Locale_(computer_software) for the possibilities

	logLevel: ["INFO", "LOG", "WARN", "ERROR"], // Add "DEBUG" for even more logging
	timeFormat: 24,
	units: "metric",

	modules: [
		{
			module: "alert",
		},
		{
			module: "updatenotification",
			position: "top_bar"
		},
		{
			module: "clock",
			position: "top_left",
			config: {
				timezone: "Asia/Kolkata"
			}
		},
		{
			module: "compliments",
			position: "lower_third"
		},
		{
			module: "weather",
			position: "top_left",
			config: {
				weatherProvider: "openmeteo",
				type: "current",
				lat: 12.971598,
				lon: 77.594566
			}
		},
		{
			module: "weather",
			position: "bottom_left",
			header: "Weather Forecast",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				lat: 12.971598,
				lon: 77.594566
			}
		},
		{
			module: "MMM-Formula1",
			position: "bottom_right",
			header: "Formula 1",
			config: {
				showStanding: "MIX",              // Rotate between driver and constructor standings (30s each)
				maxRowsDriver: 3,                 // Show top 5 drivers
				maxRowsConstructor: 3,            // Show top 5 constructors
				showSchedule: true,               // Show upcoming race schedule and circuit layout
				showNextRace: false,              // Hide next race info (cleaner look)
				grayscale: false,                 // Keep colors for flags and circuit (more fun!)
				fade: false,                      // No fade effect on list
				animationSpeed: 2500,             // Smooth transition animations between views
				reloadInterval: 1800000           // Update every 30 minutes
			}
		},
		{
			module: "newsfeed",
			position: "bottom_bar",
			config: {
				feeds: [
					{
						title: "The Hindu",
						url: "https://www.thehindu.com/news/national/feeder/default.rss"
					}
				],
				showSourceTitle: true,
				showPublishDate: true,
				broadcastNewsFeeds: true,
				broadcastNewsUpdates: true
			}
		},
		{
            module: 'MMM-Gemini',
            position: 'lower_third',
            config: {
                    apiKey: 'Enter Key Here',
            }
    	},
		{
			module: "MMM-OnSpotify",
			position: "top_right",
			config: {
				clientID: "",
				clientSecret: "",
				accessToken: "",
				refreshToken: ""
			}
		}
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
