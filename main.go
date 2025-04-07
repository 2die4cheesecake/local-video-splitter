package main

import (
	"log"
	"net/http"

	"golang.org/x/time/rate"
)

func rateLimiter(next http.Handler) http.Handler {
	limiter := rate.NewLimiter(1, 3)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow() {
			http.Error(w, http.StatusText(http.StatusTooManyRequests), http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	fs := http.FileServer(http.Dir("./public")) // Serve files from current folder

	http.Handle("/", rateLimiter(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Required headers for ffmpeg.wasm
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
		fs.ServeHTTP(w, r)
	})))

	log.Println("Server running at http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
