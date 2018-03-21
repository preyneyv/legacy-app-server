const path = require('path')
const fs = require('fs')
const conf = require('./config.json')

const loggedIn = (req, res, next) => req.serverSession.loggedIn ? next() : res.redirect('/admin')
global.checkEnabled = (appUrl) => (req, res, next) => {
	const appDetails = apps.filter(a => a.url == appUrl)
	console.log(appDetails.disabled)
}

module.exports = app => {
	app.get('/', (req, res) => res.render("appListing", { apps }))

	app.get('/admin', (req, res) => {
		if (req.serverSession.loggedIn) {
			res.render('admin/dashboard', { apps })
		} else {
			res.render('admin/login')
		}
	})
	app.post('/admin/login', (req, res) => {
		const { username, password } = req.post

		if (username !== conf.admin.username
		|| password !== conf.admin.password) {
			return res.send({success: false, message: "incorrect_username_or_password"})
		}
		// successful login
		req.serverSession.loggedIn = true
		return res.send({success: true})
	})
	app.get('/admin/logout', (req, res) => {
		req.serverSession.reset()
		return res.redirect('/admin')
	})
	app.get('/admin/apps',
		loggedIn,
		(req, res) => res.send({success: true, apps})
	)
	app.post('/admin/apps/toggle',
		loggedIn,
		(req, res) => {
			const {	url } = req.post

			for (var i = apps.length - 1; i >= 0; i--) {
				if (apps[i].url == url) {
					apps[i].disabled = !apps[i].disabled

					if (apps[i].disabled) {
						// create file to persist change
						fs.closeSync(fs.openSync(`${apps[i].path}/disable`, 'w'));
					} else {
						// delete file to persist change
						fs.unlinkSync(`${apps[i].path}/disable`)
					}
					apps.print()
					return res.send({success: true, apps})
				}
			}
			res.send({success: false, message: "app_not_found"})
		}
	)
}