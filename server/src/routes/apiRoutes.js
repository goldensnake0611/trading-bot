import express from 'express'
import { requireAuth } from '../middleware/authMiddleware.js'
import * as authController from '../controllers/authController.js'
import * as tradeController from '../controllers/tradeController.js'

const router = express.Router()

// Auth Routes
router.post('/login', authController.login)
router.post('/logout', authController.logout)
router.get('/check-auth', authController.checkAuth)

// Protected Trading Routes
router.use(requireAuth) // Apply auth middleware to all routes below

router.post('/start', tradeController.startBot)
router.post('/stop', tradeController.stopBot)
router.post('/sell', tradeController.sellPosition)
router.post('/toggle_autosell', tradeController.toggleAutoSell)
router.get('/status', tradeController.getStatus)
router.get('/positions', tradeController.getPositions)
router.get('/history', tradeController.getHistory)
router.get('/positions_history', tradeController.getPositionsHistory)
router.get('/balance', tradeController.getBalance)
router.get('/contracts', tradeController.getContracts)
router.get('/strategies', tradeController.getStrategies)
router.get('/logs', tradeController.getLogs)
router.get('/stats', tradeController.getStats)

export default router
