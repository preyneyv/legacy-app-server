#!/usr/bin/env nodejs
const conf = require("./config.json")

const clientSessions = require("client-sessions")
const express = require("express")
const bodyParser = require('body-parser')
const fs = require("fs")
const path = require("path")
let exec = require('child_process').exec;

const appServer = express()
const server = require("http").createServer(appServer)

global.io = require("socket.io").listen(server)
const port = conf.port || 3000

conf.appDirectory = path.resolve(conf.appDirectory)
// Get app listing
global.apps = fs.readdirSync(conf.appDirectory)
	.filter(folder => fs.statSync(`${conf.appDirectory}/` + folder).isDirectory())
	.map(folder => {
		const appPath = path.resolve(conf.appDirectory, folder)
		const package = require(appPath + "/package.json")

		return {
			path: appPath,
			name: {
				package: package.name,
				title: package.name.toLowerCase().split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
				camelCased: package.name.replace(/-([a-z])/g, g => g[1].toUpperCase())
			},
			description: package.description,
			url: "/" + (package.url || package.name),
			author: package.author,
			disabled: fs.existsSync(`${appPath}/disable`),
			mounted: false
		}
	})
	.sort((a,b) => a.name.title > b.name.title)
	.sort((a,b) => a.disabled > b.disabled)
apps.print = () => {
	console.log(apps.map(a => {
		const disabledStr = a.disabled ? "✘" : "✓"
		return `- ${a.name.title} - ${a.url} - ${disabledStr}`
	}).join('\n'))
	console.log("---\n")
}
console.log("# DETECTED APPS")
apps.print()

appServer.use(bodyParser.json())
appServer.use(bodyParser.urlencoded({ extended: true }))

appServer.use((req, res, next) => {
	req.post = req.body
	req.get = req.query
	next()
})
const slashAdder = (req, res, next) => {
	if (req.method != "GET") return next();
	if (req.url.split('?')[0].endsWith('/')) {
		return next()
	} else {
		if (path.extname(req.url) == '') {
			// IT'S A ROUTE
			let qIndex = req.url.indexOf('?')
			let newUrl
			if (qIndex > -1)
				newUrl = req.url.split('?')[0] + '/?' + req.url.split('?')[1]
			else
				newUrl = req.url + '/'
			res.redirect(newUrl)
		} else {
			// IT'S A FILE
			return next()
		}
	}
}
appServer.use(slashAdder)

appServer.use(clientSessions({
	cookieName: 'serverSession',
	secret: conf.sessionSecret
}))

const expressHandlebars = require("express-handlebars")
appServer.engine('hbs', expressHandlebars())
appServer.set('view engine', 'hbs')
appServer.set('views', __dirname + "/views")

// Initiate app server routes
require('./routes')(appServer)

server.listen(port, console.log(`*App server listening on port ${port}!*\n`))

// Mount each app
const loggedIn = (req, res, next) => req.serverSession.loggedIn ? next() : res.redirect('/admin')
if (!conf.autoInstallPackages) {
	exec = (a, b, cb) => cb(null, null, null)
}

apps.forEach(appDetails => {
	// ensure packages are installed
	console.log(`Checking packages for ${appDetails.name.title}`)
	exec('yarn', {
		cwd: appDetails.path
	}, (error, stdout, stderr) => {
		// init app
		let client = require(appDetails.path);
		let admin = require(path.join(appDetails.path, 'admin/index.js'));
		client.app.use(clientSessions({
			cookieName: appDetails.name.package,
			secret: conf.sessionSecret
		}))
		client.app.use((req, res, next) => {
			res.file = file => res.sendFile(path.resolve(appDetails.path, file))
			req.session = req[appDetails.name.package]
			next()
		})
		admin.app.use((req, res, next) => {
			res.file = file => res.sendFile(path.resolve(appDetails.path, 'admin', file))
			next()
		})
		client.init()
		admin.init()
		appServer.use("/admin" + appDetails.url, loggedIn, admin.app)
		appServer.use(appDetails.url, (req, res, next) => {
			const app = apps.filter(a => a.url == appDetails.url)[0]
			if (app.disabled) {
				res.sendStatus(404)
			} else {
				next()
			}
		}, client.app)
		console.log(`${appDetails.name.title} mounted!`)
		appDetails.mounted = true
	})
})

